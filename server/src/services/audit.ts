import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { MembershipOperation } from "./membership.js";

/**
 * There is no authentication and no artifact/user relation, so the actor is a
 * placeholder. It is spelled out rather than left as an empty string or a
 * hostname, because a field that looks like an identity and is not is worse than
 * one that admits what it is. The trail answers what happened and when.
 */
export const LOCAL_ACTOR = "local user";

export interface AuditEntry {
  at: string;
  actor: string;
  kind: "prompt" | "template";
  artifact_id: string;
  artifact_name: string;
  operation: MembershipOperation;
  /** The project the operation was about, where one applies. */
  project?: string | null;
  /**
   * The whole membership set on each side, not a delta. One line then answers
   * "what was true before this?" without replaying the file, and a missing line
   * becomes detectable: two consecutive entries for the same artifact whose
   * `after` and `before` disagree.
   */
  before: string[];
  after: string[];
  /** Provenance for forks, and the old name for renames. */
  detail?: Record<string, string>;
}

export type AuditInput = Omit<AuditEntry, "at" | "actor">;

export interface AuditLog {
  record(entry: AuditInput): Promise<void>;
  /** Every entry for one artifact, oldest first. */
  read(artifactId: string): Promise<AuditEntry[]>;
}

function stamp(entry: AuditInput): AuditEntry {
  return { at: new Date().toISOString(), actor: LOCAL_ACTOR, ...entry };
}

/**
 * Append-only JSONL on disk.
 *
 * Written *after* the state change, never before. There is no transaction to
 * join: the store is an in-memory Map and this is a file. Given that, a missing
 * entry is the failure to prefer, because the before/after chain exposes it,
 * while an entry for a change that did not happen is invisible. Best effort,
 * said plainly rather than implied otherwise.
 *
 * One `appendFile` per line, each ending in a newline. A single append under the
 * pipe buffer size is atomic enough for one process, which is all there is.
 *
 * Reading one artifact's history is a linear scan filtered on `artifact_id`.
 * That holds into the low tens of thousands of lines; past that the answer is an
 * index or SQLite, not a faster scan. There is no rotation, deliberately,
 * because rotating an audit trail means choosing what to forget.
 */
export function createFileAuditLog(path: string): AuditLog {
  return {
    async record(entry) {
      const line = JSON.stringify(stamp(entry)) + "\n";
      try {
        await appendFile(path, line, "utf-8");
      } catch (err) {
        // Create the directory and try once more.
        //
        // This used to memoise the mkdir behind a flag, which meant that once
        // the directory was gone the log stayed broken for the life of the
        // process: every later append failed with ENOENT and the flag said
        // there was nothing to do about it. An audit trail that gives up
        // permanently because a folder moved fails at exactly the moment it is
        // supposed to be evidence. Recovering costs one syscall on the first
        // write and nothing after that.
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        await mkdir(dirname(path), { recursive: true });
        await appendFile(path, line, "utf-8");
      }
    },

    async read(artifactId) {
      let raw: string;
      try {
        raw = await readFile(path, "utf-8");
      } catch {
        // Nothing has happened yet. An absent trail and an empty one are the
        // same answer to "what happened to this artifact".
        return [];
      }
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          try {
            return JSON.parse(line) as AuditEntry;
          } catch {
            // A torn last line from a crash mid-append. Skipping it is right:
            // the alternative is refusing to show any history because the most
            // recent line is damaged.
            return null;
          }
        })
        .filter((e): e is AuditEntry => e !== null && e.artifact_id === artifactId);
    },
  };
}

/** In-memory, for tests and for anything that must not touch the disk. */
export function createMemoryAuditLog(): AuditLog & { all(): AuditEntry[] } {
  const entries: AuditEntry[] = [];
  return {
    async record(entry) {
      entries.push(stamp(entry));
    },
    async read(artifactId) {
      return entries.filter((e) => e.artifact_id === artifactId);
    },
    all() {
      return [...entries];
    },
  };
}
