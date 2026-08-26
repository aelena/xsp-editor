import { describe, it, expect, beforeEach } from "vitest";
import { MemoryAuthStore, SqliteAuthStore, type AuthStore, type UserRecord } from "./auth-store.js";
import { SqliteStorageAdapter } from "./sqlite.js";

/**
 * One suite, both auth stores.
 *
 * The same argument as the storage contract, with more at stake: the routes are
 * tested against the in-memory store and a running server uses the SQLite one,
 * so a difference between them is a difference in who can sign in. The SQLite
 * half was at 48% coverage before this existed.
 */

const NOW = "2026-08-26T10:00:00.000Z";
const LATER = "2026-09-26T10:00:00.000Z";

function user(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "11111111-0000-4000-8000-000000000001",
    username: "antonio",
    display_name: "Antonio",
    password_hash: "scrypt$65536$8$1$c2FsdA==$aGFzaA==",
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

const STORES: [string, () => AuthStore][] = [
  ["MemoryAuthStore", () => new MemoryAuthStore()],
  ["SqliteAuthStore", () => new SqliteAuthStore(new SqliteStorageAdapter(":memory:").database())],
];

describe.each(STORES)("%s", (_name, create) => {
  let store: AuthStore;

  beforeEach(() => {
    store = create();
  });

  describe("users", () => {
    it("starts empty, which is what triggers the bootstrap screen", async () => {
      expect(await store.countUsers()).toBe(0);
    });

    it("round-trips a user", async () => {
      const one = user();
      await store.createUser(one);
      expect(await store.getUserById(one.id)).toEqual(one);
    });

    it("finds a user by name regardless of case", async () => {
      // The unique index is case insensitive, so the lookup has to be too, or
      // "Antonio" registers and then cannot sign in as "antonio".
      await store.createUser(user({ username: "Antonio" }));
      expect((await store.getUserByUsername("ANTONIO"))?.username).toBe("Antonio");
      expect((await store.getUserByUsername("antonio"))?.username).toBe("Antonio");
    });

    it("answers null for a name nobody has", async () => {
      expect(await store.getUserByUsername("nobody")).toBeNull();
      expect(await store.getUserById("11111111-0000-4000-8000-000000000009")).toBeNull();
    });

    it("refuses two users whose names differ only by case", async () => {
      await store.createUser(user({ username: "antonio" }));
      await expect(
        store.createUser(user({ id: "22222222-0000-4000-8000-000000000002", username: "ANTONIO" })),
      ).rejects.toThrow();
    });

    it("counts them", async () => {
      await store.createUser(user());
      await store.createUser(user({ id: "22222222-0000-4000-8000-000000000002", username: "bea" }));
      expect(await store.countUsers()).toBe(2);
    });

    it("lists them by name", async () => {
      await store.createUser(user({ id: "22222222-0000-4000-8000-000000000002", username: "zoe" }));
      await store.createUser(user());
      expect((await store.listUsers()).map((u) => u.username)).toEqual(["antonio", "zoe"]);
    });

    it("replaces the password hash and nothing else", async () => {
      const one = user();
      await store.createUser(one);
      await store.updatePasswordHash(one.id, "scrypt$131072$8$1$bmV3$bmV3", LATER);

      const updated = await store.getUserById(one.id);
      expect(updated).toEqual({
        ...one,
        password_hash: "scrypt$131072$8$1$bmV3$bmV3",
        updated_at: LATER,
      });
    });
  });

  describe("sessions", () => {
    beforeEach(async () => {
      await store.createUser(user());
    });

    const session = (overrides = {}) => ({
      token_hash: "hash-of-a-token",
      user_id: user().id,
      created_at: NOW,
      expires_at: LATER,
      ...overrides,
    });

    it("finds a live session", async () => {
      await store.createSession(session());
      expect(await store.getSession("hash-of-a-token", NOW)).toEqual(session());
    });

    it("does not find one that has expired", async () => {
      // Expiry is part of the lookup rather than a check each caller remembers,
      // because a caller who forgets it honours expired sessions.
      await store.createSession(session({ expires_at: "2020-01-01T00:00:00.000Z" }));
      expect(await store.getSession("hash-of-a-token", NOW)).toBeNull();
    });

    it("treats the expiry instant itself as expired", async () => {
      await store.createSession(session({ expires_at: NOW }));
      expect(await store.getSession("hash-of-a-token", NOW)).toBeNull();
    });

    it("does not find one that was never created", async () => {
      expect(await store.getSession("never-issued", NOW)).toBeNull();
    });

    it("ends one on request", async () => {
      await store.createSession(session());
      await store.deleteSession("hash-of-a-token");
      expect(await store.getSession("hash-of-a-token", NOW)).toBeNull();
    });

    it("treats deleting an unknown session as fine", async () => {
      // Logging out twice should not be an error, and this is where that starts.
      await expect(store.deleteSession("never-issued")).resolves.not.toThrow();
    });

    it("ends every session a user has", async () => {
      // What a password change does. Leaving the others alive answers a
      // suspected compromise by doing nothing.
      await store.createSession(session({ token_hash: "one" }));
      await store.createSession(session({ token_hash: "two" }));

      await store.deleteSessionsForUser(user().id);

      expect(await store.getSession("one", NOW)).toBeNull();
      expect(await store.getSession("two", NOW)).toBeNull();
    });

    it("leaves other users' sessions alone", async () => {
      const other = user({ id: "22222222-0000-4000-8000-000000000002", username: "bea" });
      await store.createUser(other);
      await store.createSession(session({ token_hash: "mine" }));
      await store.createSession(session({ token_hash: "theirs", user_id: other.id }));

      await store.deleteSessionsForUser(user().id);

      expect(await store.getSession("mine", NOW)).toBeNull();
      expect(await store.getSession("theirs", NOW)).not.toBeNull();
    });

    it("sweeps only the expired ones", async () => {
      await store.createSession(session({ token_hash: "live" }));
      await store.createSession({
        ...session({ token_hash: "dead" }),
        expires_at: "2020-01-01T00:00:00.000Z",
      });

      expect(await store.deleteExpiredSessions(NOW)).toBe(1);
      expect(await store.getSession("live", NOW)).not.toBeNull();
    });

    it("keeps several concurrent sessions for one user", async () => {
      // Signing in on a phone should not sign you out on a laptop.
      await store.createSession(session({ token_hash: "laptop" }));
      await store.createSession(session({ token_hash: "phone" }));

      expect(await store.getSession("laptop", NOW)).not.toBeNull();
      expect(await store.getSession("phone", NOW)).not.toBeNull();
    });
  });
});

describe("SqliteAuthStore only", () => {
  it("removes a user's sessions when the user goes", async () => {
    // ON DELETE CASCADE, which the memory store has no equivalent of and the
    // application never triggers today. Asserted here so that deleting a user,
    // when that arrives, cannot leave live sessions pointing at nobody.
    const adapter = new SqliteStorageAdapter(":memory:");
    const db = adapter.database();
    const store = new SqliteAuthStore(db);

    await store.createUser(user());
    await store.createSession({
      token_hash: "hash",
      user_id: user().id,
      created_at: NOW,
      expires_at: LATER,
    });

    db.prepare("DELETE FROM users WHERE id = ?").run(user().id);

    expect(await store.getSession("hash", NOW)).toBeNull();
  });
});
