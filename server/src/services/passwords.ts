import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing with scrypt, from node:crypto.
 *
 * A key derivation function rather than a plain hash. SHA-256 is fast, which is
 * exactly what helps someone working through a stolen password list; scrypt is
 * deliberately slow and memory-hard, so the same attempt costs real hardware.
 * bcrypt and argon2 would both be fine and both are native modules, which this
 * project avoids because CI crosses Windows and Linux.
 *
 * The encoded form carries its own parameters. That is what lets the cost go up
 * later and be applied to each user on their next successful login, instead of
 * a change that invalidates every password at once.
 */

const PARAMS = {
  // 2^16. Roughly a tenth of a second on current hardware, which is unnoticeable
  // to someone typing a password and expensive to do a few billion times.
  N: 1 << 16,
  r: 8,
  p: 1,
  // scrypt needs about 128 * N * r bytes; the default cap of 32 MB is below
  // what these parameters want, so it is raised deliberately rather than the
  // cost being lowered to fit it.
  maxmem: 160 * 1024 * 1024,
};

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(password, salt, KEY_LENGTH, PARAMS);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/**
 * Check a password against a stored hash.
 *
 * Never throws on a malformed hash: a corrupted row should fail the login, not
 * take down the endpoint, and the difference between "wrong password" and
 * "unreadable record" is not something a caller at the door should learn.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, keyB64] = parts;
  const params = { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem };
  if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) {
    return false;
  }

  let expected: Buffer;
  let salt: Buffer;
  try {
    expected = Buffer.from(keyB64, "base64");
    salt = Buffer.from(saltB64, "base64");
  } catch {
    return false;
  }
  if (expected.length === 0 || salt.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await scryptAsync(password, salt, expected.length, params);
  } catch {
    return false;
  }

  // Constant time. A plain === leaks how much of the hash matched through how
  // long the comparison took.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** True when a stored hash was made with parameters weaker than the current ones. */
export function needsRehash(encoded: string): boolean {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) < PARAMS.N;
}

/** A session token: 256 bits from the CSPRNG, which is not guessable. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * What gets stored for a session.
 *
 * SHA-256 and not scrypt, deliberately. Stretching exists to make a guessable
 * secret expensive to guess, and there is nothing to guess here: the token is
 * 256 bits of randomness. Hashing it at all is so that a leaked database does
 * not also hand over every live session.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
