import type { FastifyInstance, FastifyRequest } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import type { AuthStore, UserRecord } from "../storage/auth-store.js";
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  needsRehash,
  verifyPassword,
} from "../services/passwords.js";

/**
 * Users, sessions, and the gate in front of everything else.
 *
 * Deliberately small: usernames, passwords, revocable sessions. No SSO, no
 * roles, no organisations. This is meant to be enough for a handful of people
 * who already trust each other and want the thing not to be open to the network.
 */

const SESSION_DAYS = 30;

const credentialsSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(500),
});

const bootstrapSchema = z.object({
  username: z.string().min(1).max(100),
  // A floor, not a policy. Composition rules push people towards Passw0rd! and
  // length is the property that actually costs an attacker anything.
  password: z.string().min(12).max(500),
  display_name: z.string().max(200).optional(),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(500),
  new_password: z.string().min(12).max(500),
});

/**
 * Paths reachable without a session.
 *
 * An allowlist, not a blocklist. A blocklist is wrong the moment somebody adds
 * a route and forgets to update it, and the failure is silent and in the
 * dangerous direction. This list is short enough to read, and everything absent
 * from it is closed.
 */
const OPEN_PATHS = new Set([
  "/api/v1/auth/status",
  "/api/v1/auth/login",
  "/api/v1/auth/bootstrap",
  // Logging out is open, and safe to be: the handler deletes only the session
  // matching the token presented, so a caller without a valid one deletes
  // nothing, and a caller with one already owns that session. Behind the gate
  // it 401s on a session that has already ended somewhere else, which turns
  // "you are signed out" into an error message about being signed out.
  "/api/v1/auth/logout",
  "/api/v1/health",
]);

export interface AuthContext {
  store: AuthStore;
  /** When false, no gate is installed and every request is anonymous. */
  required: boolean;
}

/** The user a request is authenticated as, when it is. */
declare module "fastify" {
  interface FastifyRequest {
    user?: UserRecord;
  }
}

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim() || null;
  }
  // Also accepted, because the client already sends this header and a browser
  // fetch cannot set an Authorization header on a cross-origin request without
  // preflight.
  const apiKey = request.headers["x-api-key"];
  return typeof apiKey === "string" && apiKey.length > 0 ? apiKey : null;
}

export function registerAuthRoutes(app: FastifyInstance, auth: AuthContext): void {
  const { store } = auth;

  const sessionExpiry = (from: Date) =>
    new Date(from.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  /** Issue a session and hand back the only copy of the token. */
  const startSession = async (user: UserRecord): Promise<string> => {
    const token = generateSessionToken();
    const now = new Date();
    await store.createSession({
      token_hash: hashSessionToken(token),
      user_id: user.id,
      created_at: now.toISOString(),
      expires_at: sessionExpiry(now),
    });
    return token;
  };

  const publicUser = (user: UserRecord) => ({
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    created_at: user.created_at,
  });

  if (auth.required) {
    // The server's first hook. Everything not on the allowlist needs a session.
    app.addHook("onRequest", async (request, reply) => {
      const path = request.url.split("?")[0];
      if (!path.startsWith("/api/")) return;
      if (OPEN_PATHS.has(path)) return;

      const token = bearerToken(request);
      if (!token) {
        return reply.status(401).send({ error: "Authentication required" });
      }

      const session = await store.getSession(hashSessionToken(token), new Date().toISOString());
      if (!session) {
        // Covers unknown, revoked and expired alike. Telling the caller which
        // one only helps someone who is guessing.
        return reply.status(401).send({ error: "Session is not valid" });
      }

      const user = await store.getUserById(session.user_id);
      if (!user) {
        return reply.status(401).send({ error: "Session is not valid" });
      }
      request.user = user;
    });
  }

  /**
   * Whether this server wants a login, and whether anyone has been created yet.
   *
   * Open by necessity: the client has to know which screen to show before it
   * can have a session. It reveals only what an unauthenticated caller would
   * learn from the login page anyway.
   */
  app.get("/api/v1/auth/status", async () => ({
    auth_required: auth.required,
    // Whether the first account still needs creating, which is the one branch
    // the client cannot guess.
    needs_bootstrap: (await store.countUsers()) === 0,
  }));

  /**
   * Create the first account.
   *
   * Only while there are none. The alternative, shipping a default password, is
   * how self-hosted software ends up with thousands of installations sharing
   * one set of credentials.
   */
  app.post("/api/v1/auth/bootstrap", async (request, reply) => {
    if ((await store.countUsers()) > 0) {
      return reply.status(409).send({
        error: "An account already exists. Sign in, or add users from inside the application.",
      });
    }

    const parsed = bootstrapSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "A username and a password of at least 12 characters are required",
        details: parsed.error.issues,
      });
    }

    const now = new Date().toISOString();
    const user: UserRecord = {
      id: uuidv4(),
      username: parsed.data.username,
      display_name: parsed.data.display_name ?? parsed.data.username,
      password_hash: await hashPassword(parsed.data.password),
      created_at: now,
      updated_at: now,
    };
    await store.createUser(user);

    return reply.status(201).send({ user: publicUser(user), token: await startSession(user) });
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "A username and password are required" });
    }

    const user = await store.getUserByUsername(parsed.data.username);
    if (!user) {
      // Deliberately the same shape and cost as a wrong password: hash anyway,
      // so the time taken does not say whether the username exists.
      await hashPassword(parsed.data.password);
      return reply.status(401).send({ error: "Wrong username or password" });
    }

    if (!(await verifyPassword(parsed.data.password, user.password_hash))) {
      return reply.status(401).send({ error: "Wrong username or password" });
    }

    // The password is in hand and known good, which is the only moment a hash
    // made with weaker parameters can be upgraded without asking anyone.
    if (needsRehash(user.password_hash)) {
      await store.updatePasswordHash(
        user.id,
        await hashPassword(parsed.data.password),
        new Date().toISOString(),
      );
    }

    return reply.send({ user: publicUser(user), token: await startSession(user) });
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const token = bearerToken(request);
    if (token) await store.deleteSession(hashSessionToken(token));
    // Idempotent on purpose. A client logging out should never be told it
    // failed, and there is nothing useful it could do about it.
    return reply.send({ ok: true });
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    if (!request.user) return reply.status(401).send({ error: "Not signed in" });
    return reply.send({ user: publicUser(request.user) });
  });

  app.get("/api/v1/auth/users", async (request, reply) => {
    if (auth.required && !request.user) {
      return reply.status(401).send({ error: "Not signed in" });
    }
    return reply.send({ users: (await store.listUsers()).map(publicUser) });
  });

  /** Add another person. Anyone signed in can, since there are no roles. */
  app.post("/api/v1/auth/users", async (request, reply) => {
    if (auth.required && !request.user) {
      return reply.status(401).send({ error: "Not signed in" });
    }

    const parsed = bootstrapSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "A username and a password of at least 12 characters are required",
        details: parsed.error.issues,
      });
    }

    if (await store.getUserByUsername(parsed.data.username)) {
      return reply.status(409).send({ error: "That username is taken" });
    }

    const now = new Date().toISOString();
    const user: UserRecord = {
      id: uuidv4(),
      username: parsed.data.username,
      display_name: parsed.data.display_name ?? parsed.data.username,
      password_hash: await hashPassword(parsed.data.password),
      created_at: now,
      updated_at: now,
    };
    await store.createUser(user);
    return reply.status(201).send({ user: publicUser(user) });
  });

  app.post("/api/v1/auth/password", async (request, reply) => {
    if (!request.user) return reply.status(401).send({ error: "Not signed in" });

    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "The current password and a new one of at least 12 characters are required",
      });
    }

    if (!(await verifyPassword(parsed.data.current_password, request.user.password_hash))) {
      return reply.status(401).send({ error: "Wrong current password" });
    }

    await store.updatePasswordHash(
      request.user.id,
      await hashPassword(parsed.data.new_password),
      new Date().toISOString(),
    );
    // Every session ends, including this one. A password change is what someone
    // does when they think a session is not theirs any more, and leaving the
    // others alive answers that by doing nothing.
    await store.deleteSessionsForUser(request.user.id);

    return reply.send({ ok: true, sessions_ended: true });
  });
}
