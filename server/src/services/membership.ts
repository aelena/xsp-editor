import {
  ARCHIVE_PROJECT_ID,
  GENERAL_PROJECT_ID,
} from "../schemas/projects.js";

/**
 * The membership rules, as pure functions over a set of project ids.
 *
 * They are separated from storage and from the routes because they are the part
 * worth being sure about, and because every interesting case is a one-line test
 * rather than an HTTP round trip.
 *
 * Two invariants hold everywhere below:
 *
 *   1. Every artifact belongs to at least one project. `General` is how the
 *      system spells "no project", so an empty set is never a resting state.
 *   2. Nothing is ever destroyed. Every removal ends in another project, in
 *      `General`, or in `Archive`.
 */

/** What to do with an artifact a removal would leave with no project. */
export type OrphanChoice = "archive" | "general";

export type MembershipOperation =
  | "created"
  | "renamed"
  | "added_to"
  | "removed_from"
  | "archived"
  | "unarchived"
  | "forked_from"
  | "forked_to"
  | "labelled";

export function normalise(projects: readonly string[] | undefined): string[] {
  // Deduplicated and sorted, so equality and audit lines are stable rather than
  // dependent on the order things happened to be added in.
  return Array.from(new Set(projects ?? [])).sort();
}

export function isArchived(projects: readonly string[]): boolean {
  return projects.includes(ARCHIVE_PROJECT_ID);
}

/** The set an artifact starts with: the project it was created in, or General. */
export function initialMembership(projectId?: string | null): string[] {
  return normalise([projectId || GENERAL_PROJECT_ID]);
}

export interface AddOutcome {
  after: string[];
  /**
   * True when the artifact was in Archive and this add took it out. The caller
   * records it as a separate audit entry, because two things happened and a
   * trail that shows one of them is misleading.
   */
  unarchived: boolean;
}

/**
 * Add one membership.
 *
 * Adding a live project to an archived artifact takes it out of Archive rather
 * than failing, because that is what the action means: putting something back
 * into service. Archive stays exclusive either way, which is the invariant that
 * matters. The alternative, an error telling the user to unarchive first, is two
 * steps for one intention.
 */
export function addTo(
  projects: readonly string[],
  projectId: string,
): AddOutcome {
  if (projectId === ARCHIVE_PROJECT_ID) {
    return { after: [ARCHIVE_PROJECT_ID], unarchived: false };
  }
  if (isArchived(projects)) {
    return { after: normalise([projectId]), unarchived: true };
  }
  return { after: normalise([...projects, projectId]), unarchived: false };
}

/**
 * True when removing this project would leave the artifact with nothing, which
 * is the moment the user has to be asked archive-or-General.
 */
export function wouldOrphan(
  projects: readonly string[],
  projectId: string,
): boolean {
  return normalise(projects).filter((p) => p !== projectId).length === 0;
}

/** A removal either resolves, or needs an answer from the user first. */
export type RemovalOutcome =
  | { kind: "resolved"; after: string[]; archived: boolean }
  | { kind: "needs_choice" };

/**
 * Remove one membership. This single rule covers what the brief described as two
 * separate cases, leaving a normal project and leaving `General`, because both
 * are the same question: did that empty the set?
 */
export function removeFrom(
  projects: readonly string[],
  projectId: string,
  choice?: OrphanChoice,
): RemovalOutcome {
  const remaining = normalise(projects).filter((p) => p !== projectId);

  if (remaining.length > 0) {
    return { kind: "resolved", after: remaining, archived: false };
  }
  if (!choice) return { kind: "needs_choice" };

  if (choice === "archive") {
    return { kind: "resolved", after: [ARCHIVE_PROJECT_ID], archived: true };
  }

  // Choosing "general" while removing from General itself is a no-op rather
  // than an error: the user was asked whether to archive, declined, and the
  // artifact stays where it was.
  return { kind: "resolved", after: [GENERAL_PROJECT_ID], archived: false };
}

/** Archive is exclusive: a retired artifact under three live projects is not retired. */
export function archive(): string[] {
  return [ARCHIVE_PROJECT_ID];
}

/**
 * Out of Archive and into General. It cannot restore the memberships archiving
 * cleared, but the `archived` audit entry recorded them, so restoring them later
 * is a feature the data already supports rather than a migration.
 */
export function unarchive(projects: readonly string[]): string[] {
  const kept = normalise(projects).filter((p) => p !== ARCHIVE_PROJECT_ID);
  return kept.length > 0 ? kept : [GENERAL_PROJECT_ID];
}

/**
 * What happens to one member when its project is deleted. The artifact loses
 * exactly this membership and nothing else, so one with another home is
 * untouched and the archive-or-General answer only reaches the ones that would
 * be left with nothing.
 */
export function afterProjectDeleted(
  projects: readonly string[],
  deletedProjectId: string,
  choice: OrphanChoice,
): { after: string[]; archived: boolean } {
  const outcome = removeFrom(projects, deletedProjectId, choice);
  // The choice is required by this signature, so needs_choice is unreachable.
  return outcome.kind === "resolved"
    ? { after: outcome.after, archived: outcome.archived }
    : { after: normalise(projects), archived: false };
}
