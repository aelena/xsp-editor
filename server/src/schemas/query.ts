import { z } from "zod";

/**
 * A boolean from a query string.
 *
 * Not `z.coerce.boolean()`, which is `Boolean(value)` and therefore turns every
 * non-empty string into true. `?include_archived=false` meant true, which is
 * the exact opposite of what the caller asked for, and it was doing that in
 * both listing endpoints.
 *
 * Absent means false rather than an error, because these are optional filters
 * and a missing one is a caller who did not ask. An unrecognised value is an
 * error, because a caller who wrote something is trying to say something, and
 * guessing which is how `?include_archived=no` deletes the distinction.
 */
export const booleanQuery = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((value) => value === "true" || value === "1");
