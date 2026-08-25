import { describe, it, expect } from "vitest";
import {
  ARCHIVE_PROJECT_ID as ARCHIVE,
  GENERAL_PROJECT_ID as GENERAL,
} from "../schemas/projects.js";
import {
  addTo,
  afterProjectDeleted,
  archive,
  initialMembership,
  isArchived,
  normalise,
  removeFrom,
  unarchive,
  wouldOrphan,
} from "./membership.js";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

describe("normalise", () => {
  it("deduplicates", () => {
    expect(normalise([A, A, B])).toEqual([A, B].sort());
  });

  it("sorts, so audit lines and equality checks do not depend on insertion order", () => {
    expect(normalise([B, A])).toEqual(normalise([A, B]));
  });

  it("treats undefined as empty", () => {
    expect(normalise(undefined)).toEqual([]);
  });
});

describe("initialMembership", () => {
  it("puts an artifact with no chosen project in General", () => {
    expect(initialMembership()).toEqual([GENERAL]);
    expect(initialMembership(null)).toEqual([GENERAL]);
    expect(initialMembership("")).toEqual([GENERAL]);
  });

  it("puts an artifact created inside a project in that project only", () => {
    // Not "that project and General": General means "belongs to nothing else",
    // so adding both would make it meaningless.
    expect(initialMembership(A)).toEqual([A]);
  });
});

describe("addTo", () => {
  it("adds without disturbing the others", () => {
    expect(addTo([GENERAL, A], B).after).toEqual(normalise([GENERAL, A, B]));
  });

  it("is idempotent", () => {
    expect(addTo([A], A).after).toEqual([A]);
  });

  it("takes an archived artifact out of Archive rather than failing", () => {
    // Adding a live project to a retired artifact means putting it back into
    // service. An error telling the user to unarchive first is two steps for one
    // intention.
    const outcome = addTo([ARCHIVE], A);
    expect(outcome.after).toEqual([A]);
    expect(outcome.unarchived).toBe(true);
  });

  it("keeps Archive exclusive when adding Archive itself", () => {
    expect(addTo([GENERAL, A], ARCHIVE).after).toEqual([ARCHIVE]);
  });

  it("reports no unarchive when there was nothing to unarchive", () => {
    expect(addTo([GENERAL], A).unarchived).toBe(false);
  });
});

describe("wouldOrphan", () => {
  it("is true only when the set would empty", () => {
    expect(wouldOrphan([A], A)).toBe(true);
    expect(wouldOrphan([GENERAL], GENERAL)).toBe(true);
    expect(wouldOrphan([GENERAL, A], A)).toBe(false);
  });

  it("is false for a project the artifact is not in", () => {
    expect(wouldOrphan([A], B)).toBe(false);
  });
});

describe("removeFrom", () => {
  it("removes and changes nothing else when another project remains", () => {
    const outcome = removeFrom([GENERAL, A, B], A);
    expect(outcome).toEqual({ kind: "resolved", after: normalise([GENERAL, B]), archived: false });
  });

  it("asks before orphaning, instead of choosing for the user", () => {
    expect(removeFrom([A], A)).toEqual({ kind: "needs_choice" });
  });

  it("archives when that is the answer", () => {
    const outcome = removeFrom([A], A, "archive");
    expect(outcome).toEqual({ kind: "resolved", after: [ARCHIVE], archived: true });
  });

  it("falls back to General when that is the answer", () => {
    const outcome = removeFrom([A], A, "general");
    expect(outcome).toEqual({ kind: "resolved", after: [GENERAL], archived: false });
  });

  it("leaves an artifact in General when removing it from General is declined", () => {
    // The user was asked whether to archive and said no. Nothing should happen,
    // and specifically it should not become an error the UI has to explain.
    expect(removeFrom([GENERAL], GENERAL, "general")).toEqual({
      kind: "resolved",
      after: [GENERAL],
      archived: false,
    });
  });

  it("removes from General and leaves the other projects alone", () => {
    const outcome = removeFrom([GENERAL, A], GENERAL);
    expect(outcome).toEqual({ kind: "resolved", after: [A], archived: false });
  });
});

describe("archive and unarchive", () => {
  it("clears every other membership", () => {
    // A retired artifact still listed under three live projects is not retired.
    expect(archive()).toEqual([ARCHIVE]);
  });

  it("returns to General", () => {
    expect(unarchive([ARCHIVE])).toEqual([GENERAL]);
  });

  it("is archived only when Archive is in the set", () => {
    expect(isArchived([ARCHIVE])).toBe(true);
    expect(isArchived([GENERAL, A])).toBe(false);
  });

  it("never leaves an artifact with nothing", () => {
    expect(unarchive([]).length).toBeGreaterThan(0);
  });
});

describe("afterProjectDeleted", () => {
  it("does not touch an artifact that has another home", () => {
    // The brief was explicit: deleting one project must not affect membership of
    // the others.
    expect(afterProjectDeleted([A, B], A, "archive")).toEqual({
      after: [B],
      archived: false,
    });
  });

  it("archives a member that would be left with nothing", () => {
    expect(afterProjectDeleted([A], A, "archive")).toEqual({
      after: [ARCHIVE],
      archived: true,
    });
  });

  it("moves a member that would be left with nothing back to General", () => {
    expect(afterProjectDeleted([A], A, "general")).toEqual({
      after: [GENERAL],
      archived: false,
    });
  });

  it("applies the choice per artifact, not per project", () => {
    // The same deletion, answered once, has different outcomes for two members
    // depending on whether each has somewhere else to be. This is the property
    // that made the brief's two paragraphs consistent.
    const orphan = afterProjectDeleted([A], A, "archive");
    const housed = afterProjectDeleted([A, GENERAL], A, "archive");
    expect(orphan.after).toEqual([ARCHIVE]);
    expect(housed.after).toEqual([GENERAL]);
  });
});
