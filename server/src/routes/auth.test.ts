import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../index.js";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { MemoryAuthStore } from "../storage/auth-store.js";
import { createMemoryAuditLog } from "../services/audit.js";
import { hashSessionToken } from "../services/passwords.js";

const PASSWORD = "a password long enough";

function createApp(required = true) {
  const store = new MemoryAuthStore();
  const app = buildApp(new MemoryStorageAdapter(), createMemoryAuditLog(), {
    store,
    required,
  });
  return { app, store };
}

async function bootstrap(app: ReturnType<typeof buildApp>, username = "antonio") {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/bootstrap",
    payload: { username, password: PASSWORD },
  });
  expect(res.statusCode).toBe(201);
  return res.json().token as string;
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe("the gate", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = createApp().app;
  });

  it("closes everything that is not on the allowlist", async () => {
    // Deny by default. A blocklist is wrong the moment someone adds a route and
    // forgets it, and the failure is silent and in the dangerous direction.
    for (const url of [
      "/api/v1/prompts",
      "/api/v1/tags",
      "/api/v1/constraints",
      "/api/v1/templates",
      "/api/v1/projects",
      "/api/v1/projects/tree",
      "/api/v1/browse-folder",
      "/api/v1/files?projectPath=/tmp",
      "/api/v1/manual",
    ]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, `${url} should need a session`).toBe(401);
    }
  });

  it("closes writes as well as reads", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/prompts",
      payload: { name: "x", description: "y", content: "<task>z</task>" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("leaves the login door open", async () => {
    for (const url of ["/api/v1/auth/status"]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(200);
    }
  });

  it("rejects a token that was never issued", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/prompts",
      headers: auth("made-up-token"),
    });
    expect(res.statusCode).toBe(401);
  });

  it("opens once a session is presented", async () => {
    const token = await bootstrap(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/prompts",
      headers: auth(token),
    });
    expect(res.statusCode).toBe(200);
  });

  it("accepts the header the client already sends", async () => {
    const token = await bootstrap(app);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/prompts",
      headers: { "x-api-key": token },
    });
    expect(res.statusCode).toBe(200);
  });

  it("ignores a malformed Authorization header rather than trusting it", async () => {
    const token = await bootstrap(app);
    for (const header of [token, `Basic ${token}`, "Bearer", "Bearer "]) {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/prompts",
        headers: { authorization: header },
      });
      expect(res.statusCode, header).toBe(401);
    }
  });

  it("lets everything through when auth is off", async () => {
    const open = createApp(false).app;
    expect((await open.inject({ method: "GET", url: "/api/v1/prompts" })).statusCode).toBe(200);
  });
});

describe("bootstrap", () => {
  it("creates the first account and signs it in", async () => {
    const { app, store } = createApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap",
      payload: { username: "antonio", password: PASSWORD },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().user.username).toBe("antonio");
    expect(res.json().token).toBeTruthy();
    expect(await store.countUsers()).toBe(1);
  });

  it("never returns the password hash", async () => {
    const { app } = createApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap",
      payload: { username: "antonio", password: PASSWORD },
    });
    expect(JSON.stringify(res.json())).not.toContain("scrypt");
  });

  it("refuses once an account exists", async () => {
    // Otherwise the one open door on the allowlist stays open forever and
    // anyone can add themselves.
    const { app } = createApp();
    await bootstrap(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap",
      payload: { username: "intruder", password: PASSWORD },
    });
    expect(res.statusCode).toBe(409);
  });

  it("refuses a password shorter than twelve characters", async () => {
    const { app } = createApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap",
      payload: { username: "antonio", password: "short" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("tells the client whether an account still needs creating", async () => {
    const { app } = createApp();
    expect((await app.inject({ method: "GET", url: "/api/v1/auth/status" })).json()).toEqual({
      auth_required: true,
      needs_bootstrap: true,
    });

    await bootstrap(app);
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/auth/status" })).json().needs_bootstrap,
    ).toBe(false);
  });
});

describe("login", () => {
  it("issues a session for the right password", async () => {
    const { app } = createApp();
    await bootstrap(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "antonio", password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeTruthy();
  });

  it("is case insensitive about the username", async () => {
    const { app } = createApp();
    await bootstrap(app, "Antonio");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "ANTONIO", password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
  });

  it("refuses the wrong password", async () => {
    const { app } = createApp();
    await bootstrap(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "antonio", password: "the wrong one entirely" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("says the same thing for an unknown user as for a wrong password", async () => {
    // Two different messages is an endpoint that confirms which usernames exist.
    const { app } = createApp();
    await bootstrap(app);

    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "nobody", password: PASSWORD },
    });
    const wrong = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "antonio", password: "not it" },
    });

    expect(unknown.statusCode).toBe(wrong.statusCode);
    expect(unknown.json().error).toBe(wrong.json().error);
  });

  it("gives each login its own token", async () => {
    const { app } = createApp();
    const first = await bootstrap(app);
    const second = (
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { username: "antonio", password: PASSWORD },
      })
    ).json().token;

    expect(first).not.toBe(second);
    // And both work: signing in on a phone should not sign you out on a laptop.
    for (const token of [first, second]) {
      expect(
        (await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: auth(token) }))
          .statusCode,
      ).toBe(200);
    }
  });
});

describe("sessions", () => {
  it("stores the hash of the token, never the token", async () => {
    // A leaked database should not also hand over every live session.
    const { app, store } = createApp();
    const token = await bootstrap(app);

    expect(await store.getSession(hashSessionToken(token), new Date().toISOString())).not.toBeNull();
    expect(await store.getSession(token, new Date().toISOString())).toBeNull();
  });

  it("stops working after logout", async () => {
    const { app } = createApp();
    const token = await bootstrap(app);

    await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: auth(token) });

    const res = await app.inject({ method: "GET", url: "/api/v1/prompts", headers: auth(token) });
    expect(res.statusCode).toBe(401);
  });

  it("treats logging out twice as fine", async () => {
    const { app } = createApp();
    const token = await bootstrap(app);
    await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: auth(token) });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: auth(token),
    });
    expect(res.statusCode).toBe(200);
  });

  it("refuses an expired session", async () => {
    const { app, store } = createApp();
    const token = await bootstrap(app);

    // Reach in and age it, rather than waiting thirty days.
    const hash = hashSessionToken(token);
    const session = await store.getSession(hash, new Date().toISOString());
    await store.deleteSession(hash);
    await store.createSession({ ...session!, expires_at: "2020-01-01T00:00:00.000Z" });

    const res = await app.inject({ method: "GET", url: "/api/v1/prompts", headers: auth(token) });
    expect(res.statusCode).toBe(401);
  });

  it("reports who is signed in", async () => {
    const { app } = createApp();
    const token = await bootstrap(app);

    const res = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: auth(token) });
    expect(res.json().user.username).toBe("antonio");
    expect(JSON.stringify(res.json())).not.toContain("password");
  });
});

describe("adding people", () => {
  it("needs a session", async () => {
    const { app } = createApp();
    await bootstrap(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/users",
      payload: { username: "bea", password: PASSWORD },
    });
    expect(res.statusCode).toBe(401);
  });

  it("creates a second person who can then sign in", async () => {
    const { app } = createApp();
    const token = await bootstrap(app);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/auth/users",
      headers: auth(token),
      payload: { username: "bea", password: PASSWORD },
    });
    expect(created.statusCode).toBe(201);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "bea", password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
  });

  it("refuses a username that differs only by case", async () => {
    const { app } = createApp();
    const token = await bootstrap(app, "antonio");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/users",
      headers: auth(token),
      payload: { username: "ANTONIO", password: PASSWORD },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("changing a password", () => {
  it("needs the current one", async () => {
    const { app } = createApp();
    const token = await bootstrap(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password",
      headers: auth(token),
      payload: { current_password: "not it", new_password: "a different long password" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("ends every session, including the one that changed it", async () => {
    // Changing a password is what someone does when they think a session is not
    // theirs any more. Leaving the others alive answers that by doing nothing.
    const { app } = createApp();
    const first = await bootstrap(app);
    const second = (
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { username: "antonio", password: PASSWORD },
      })
    ).json().token;

    const changed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password",
      headers: auth(first),
      payload: { current_password: PASSWORD, new_password: "a different long password" },
    });
    expect(changed.statusCode).toBe(200);

    for (const token of [first, second]) {
      expect(
        (await app.inject({ method: "GET", url: "/api/v1/prompts", headers: auth(token) }))
          .statusCode,
      ).toBe(401);
    }
  });

  it("accepts the new password afterwards", async () => {
    const { app } = createApp();
    const token = await bootstrap(app);
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/password",
      headers: auth(token),
      payload: { current_password: PASSWORD, new_password: "a different long password" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "antonio", password: "a different long password" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("refuses a new password that is too short", async () => {
    const { app } = createApp();
    const token = await bootstrap(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password",
      headers: auth(token),
      payload: { current_password: PASSWORD, new_password: "short" },
    });
    expect(res.statusCode).toBe(400);
  });
});
