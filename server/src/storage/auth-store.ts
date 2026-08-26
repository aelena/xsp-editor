import type { DatabaseSync } from "node:sqlite";

/**
 * Users and sessions.
 *
 * A separate interface from StorageAdapter rather than 6 more methods on it.
 * Authentication is a different concern from storing prompts, and the two have
 * no queries in common; folding them together would mean every future backend
 * has to implement both to provide either.
 */

export interface UserRecord {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface SessionRecord {
  token_hash: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

export interface AuthStore {
  countUsers(): Promise<number>;
  createUser(user: UserRecord): Promise<void>;
  getUserByUsername(username: string): Promise<UserRecord | null>;
  getUserById(id: string): Promise<UserRecord | null>;
  updatePasswordHash(id: string, passwordHash: string, updatedAt: string): Promise<void>;
  listUsers(): Promise<UserRecord[]>;

  createSession(session: SessionRecord): Promise<void>;
  /** The session for this token hash, or null if unknown or expired. */
  getSession(tokenHash: string, now: string): Promise<SessionRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
  /** Ends every session for a user. Used on password change. */
  deleteSessionsForUser(userId: string): Promise<void>;
  deleteExpiredSessions(now: string): Promise<number>;
}

type Row = Record<string, unknown>;

export class SqliteAuthStore implements AuthStore {
  constructor(private readonly db: DatabaseSync) {}

  async countUsers(): Promise<number> {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  }

  async createUser(user: UserRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        user.id,
        user.username,
        user.display_name,
        user.password_hash,
        user.created_at,
        user.updated_at,
      );
  }

  async getUserByUsername(username: string): Promise<UserRecord | null> {
    // COLLATE NOCASE, matching the unique index. Otherwise "Alice" and "alice"
    // fail to register as duplicates and then fail to find each other.
    const row = this.db
      .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
      .get(username) as Row | undefined;
    return row ? (row as unknown as UserRecord) : null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
    return row ? (row as unknown as UserRecord) : null;
  }

  async updatePasswordHash(id: string, passwordHash: string, updatedAt: string): Promise<void> {
    this.db
      .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(passwordHash, updatedAt, id);
  }

  async listUsers(): Promise<UserRecord[]> {
    return this.db
      .prepare("SELECT * FROM users ORDER BY username COLLATE NOCASE ASC")
      .all() as unknown as UserRecord[];
  }

  async createSession(session: SessionRecord): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      )
      .run(session.token_hash, session.user_id, session.created_at, session.expires_at);
  }

  async getSession(tokenHash: string, now: string): Promise<SessionRecord | null> {
    // Expiry is part of the lookup, not a check the caller has to remember. A
    // caller who forgets it is a caller who honours expired sessions.
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?")
      .get(tokenHash, now) as Row | undefined;
    return row ? (row as unknown as SessionRecord) : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  async deleteSessionsForUser(userId: string): Promise<void> {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  async deleteExpiredSessions(now: string): Promise<number> {
    const result = this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
    return Number(result.changes);
  }
}

/** For tests, and for the memory store where nothing is meant to outlive the process. */
export class MemoryAuthStore implements AuthStore {
  private users = new Map<string, UserRecord>();
  private sessions = new Map<string, SessionRecord>();

  async countUsers(): Promise<number> {
    return this.users.size;
  }

  async createUser(user: UserRecord): Promise<void> {
    if (await this.getUserByUsername(user.username)) {
      throw new Error(`User ${user.username} already exists`);
    }
    this.users.set(user.id, { ...user });
  }

  async getUserByUsername(username: string): Promise<UserRecord | null> {
    const wanted = username.toLowerCase();
    for (const user of this.users.values()) {
      if (user.username.toLowerCase() === wanted) return { ...user };
    }
    return null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  async updatePasswordHash(id: string, passwordHash: string, updatedAt: string): Promise<void> {
    const user = this.users.get(id);
    if (!user) throw new Error(`User ${id} not found`);
    this.users.set(id, { ...user, password_hash: passwordHash, updated_at: updatedAt });
  }

  async listUsers(): Promise<UserRecord[]> {
    return [...this.users.values()]
      .sort((a, b) => a.username.localeCompare(b.username))
      .map((u) => ({ ...u }));
  }

  async createSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.token_hash, { ...session });
  }

  async getSession(tokenHash: string, now: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expires_at <= now) return null;
    return { ...session };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async deleteSessionsForUser(userId: string): Promise<void> {
    for (const [hash, session] of this.sessions) {
      if (session.user_id === userId) this.sessions.delete(hash);
    }
  }

  async deleteExpiredSessions(now: string): Promise<number> {
    let removed = 0;
    for (const [hash, session] of this.sessions) {
      if (session.expires_at <= now) {
        this.sessions.delete(hash);
        removed += 1;
      }
    }
    return removed;
  }
}
