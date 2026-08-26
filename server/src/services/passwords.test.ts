import { describe, it, expect } from "vitest";
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  needsRehash,
  verifyPassword,
} from "./passwords.js";

describe("hashPassword", () => {
  it("accepts the password it hashed", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a different password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery stapl", hash)).toBe(false);
  });

  it("never stores the password", async () => {
    const hash = await hashPassword("hunter2-hunter2-hunter2");
    expect(hash).not.toContain("hunter2");
  });

  it("produces a different hash each time for the same password", async () => {
    // Without a per-password salt, two people with the same password share a
    // hash, and one cracked hash is every account that chose it.
    const a = await hashPassword("the same password");
    const b = await hashPassword("the same password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("the same password", a)).toBe(true);
    expect(await verifyPassword("the same password", b)).toBe(true);
  });

  it("records its own parameters", async () => {
    // This is what lets the cost be raised later and applied per user on their
    // next login, rather than invalidating every password at once.
    const hash = await hashPassword("a password long enough");
    const [scheme, n, r, p] = hash.split("$");
    expect(scheme).toBe("scrypt");
    expect(Number(n)).toBeGreaterThanOrEqual(1 << 16);
    expect(Number(r)).toBeGreaterThan(0);
    expect(Number(p)).toBeGreaterThan(0);
  });

  it("handles a password with characters that would break a delimiter", async () => {
    const nasty = "a$b$c$$$\n\t unicode ñ 🔐";
    const hash = await hashPassword(nasty);
    expect(await verifyPassword(nasty, hash)).toBe(true);
  });
});

describe("verifyPassword", () => {
  it("returns false rather than throwing on a corrupted hash", async () => {
    // A damaged row should fail the login, not take down the endpoint, and the
    // caller at the door should not learn the difference.
    for (const bad of [
      "",
      "not-a-hash",
      "scrypt$only$four$parts",
      "bcrypt$65536$8$1$c2FsdA==$aGFzaA==",
      "scrypt$notanumber$8$1$c2FsdA==$aGFzaA==",
      "scrypt$65536$8$1$$",
    ]) {
      expect(await verifyPassword("anything", bad), bad).toBe(false);
    }
  });

  it("rejects an empty password against a real hash", async () => {
    const hash = await hashPassword("something real");
    expect(await verifyPassword("", hash)).toBe(false);
  });
});

describe("needsRehash", () => {
  it("is false for a hash made with the current cost", async () => {
    expect(needsRehash(await hashPassword("a password long enough"))).toBe(false);
  });

  it("is true for a weaker one", () => {
    expect(needsRehash("scrypt$16384$8$1$c2FsdA==$aGFzaA==")).toBe(true);
  });

  it("is true for anything it cannot read", () => {
    // Unreadable means "not what we would write now", which is the same answer.
    expect(needsRehash("garbage")).toBe(true);
  });
});

describe("session tokens", () => {
  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateSessionToken()));
    expect(tokens.size).toBe(500);
  });

  it("carries enough entropy to be unguessable", () => {
    // 32 bytes, base64url, so no padding and nothing needing escaping in a
    // header or a URL.
    const token = generateSessionToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes deterministically, so a lookup can find it", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("does not store the token itself", () => {
    // A leaked database should not also hand over every live session.
    const token = generateSessionToken();
    expect(hashSessionToken(token)).not.toContain(token);
  });

  it("gives different hashes to different tokens", () => {
    expect(hashSessionToken("a")).not.toBe(hashSessionToken("b"));
  });
});
