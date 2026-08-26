import { describe, it, expect, beforeEach } from "vitest";
import {
  MemoryLabelStore,
  SqliteLabelStore,
  normaliseLabels,
  type LabelStore,
} from "./label-store.js";
import { SqliteStorageAdapter } from "./sqlite.js";

describe("normaliseLabels", () => {
  it("trims and collapses whitespace", () => {
    expect(normaliseLabels(["  draft ", "needs\t\treview"])).toEqual([
      "draft",
      "needs review",
    ]);
  });

  it("drops empties", () => {
    expect(normaliseLabels(["", "   ", "real"])).toEqual(["real"]);
  });

  it("deduplicates ignoring case, keeping the first spelling", () => {
    // Three people typing the same word should produce one label, and nobody
    // should have to agree on capitalisation first.
    expect(normaliseLabels(["Draft", "draft", "DRAFT"])).toEqual(["Draft"]);
  });

  it("sorts, so the same set always reads the same way", () => {
    expect(normaliseLabels(["zebra", "alpha"])).toEqual(["alpha", "zebra"]);
  });

  it("leaves anything else alone, because there are no rules", () => {
    // Free-form means free-form: punctuation, accents and emoji all survive.
    expect(normaliseLabels(["cliente/acme", "revisión", "🔥"])).toEqual(
      ["cliente/acme", "revisión", "🔥"].sort((a, b) => a.localeCompare(b)),
    );
  });
});

const STORES: [string, () => LabelStore][] = [
  ["MemoryLabelStore", () => new MemoryLabelStore()],
  ["SqliteLabelStore", () => new SqliteLabelStore(new SqliteStorageAdapter(":memory:").database())],
];

describe.each(STORES)("%s", (_name, create) => {
  let store: LabelStore;

  beforeEach(() => {
    store = create();
  });

  it("starts with nothing", async () => {
    expect(await store.labelsFor("prompt", "p1")).toEqual([]);
    expect(await store.usage()).toEqual([]);
  });

  it("stores and reads back", async () => {
    await store.setLabels("prompt", "p1", ["draft", "nlp"]);
    expect(await store.labelsFor("prompt", "p1")).toEqual(["draft", "nlp"]);
  });

  it("normalises on the way in", async () => {
    await store.setLabels("prompt", "p1", [" Draft ", "draft", ""]);
    expect(await store.labelsFor("prompt", "p1")).toEqual(["Draft"]);
  });

  it("replaces the whole set rather than merging", async () => {
    await store.setLabels("prompt", "p1", ["a", "b"]);
    await store.setLabels("prompt", "p1", ["c"]);
    expect(await store.labelsFor("prompt", "p1")).toEqual(["c"]);
  });

  it("clears when given an empty set", async () => {
    await store.setLabels("prompt", "p1", ["a"]);
    await store.setLabels("prompt", "p1", []);
    expect(await store.labelsFor("prompt", "p1")).toEqual([]);
  });

  it("keeps prompts and templates apart even with the same key", async () => {
    // A prompt id and a template name could collide, and a label on one must
    // not appear on the other.
    await store.setLabels("prompt", "same", ["from-prompt"]);
    await store.setLabels("template", "same", ["from-template"]);

    expect(await store.labelsFor("prompt", "same")).toEqual(["from-prompt"]);
    expect(await store.labelsFor("template", "same")).toEqual(["from-template"]);
  });

  it("reads many artifacts in one call", async () => {
    // The listing needs this, or every page of prompts is an N+1.
    await store.setLabels("prompt", "p1", ["a"]);
    await store.setLabels("prompt", "p2", ["b"]);

    const many = await store.labelsForMany("prompt", ["p1", "p2", "p3"]);
    expect(many.get("p1")).toEqual(["a"]);
    expect(many.get("p2")).toEqual(["b"]);
    // Present with nothing on it, rather than missing, so the caller does not
    // have to distinguish "no labels" from "not asked about".
    expect(many.get("p3")).toEqual([]);
  });

  it("copes with being asked about nothing", async () => {
    expect((await store.labelsForMany("prompt", [])).size).toBe(0);
  });

  describe("usage", () => {
    beforeEach(async () => {
      await store.setLabels("prompt", "p1", ["nlp", "draft"]);
      await store.setLabels("prompt", "p2", ["nlp"]);
      await store.setLabels("template", "t1", ["nlp"]);
    });

    it("counts how many artifacts carry each label", async () => {
      const usage = await store.usage();
      const nlp = usage.find((u) => u.label === "nlp")!;

      expect(nlp.count).toBe(3);
      expect(nlp.prompts).toBe(2);
      expect(nlp.templates).toBe(1);
    });

    it("puts the most used first", async () => {
      expect((await store.usage()).map((u) => u.label)).toEqual(["nlp", "draft"]);
    });

    it("groups spellings that differ only by case", async () => {
      await store.setLabels("template", "t2", ["NLP"]);
      const usage = await store.usage();

      expect(usage.filter((u) => u.label.toLowerCase() === "nlp")).toHaveLength(1);
      expect(usage.find((u) => u.label.toLowerCase() === "nlp")!.count).toBe(4);
    });

    it("lists which artifacts carry one", async () => {
      expect(await store.artifactsWith("nlp")).toEqual([
        { kind: "prompt", key: "p1" },
        { kind: "prompt", key: "p2" },
        { kind: "template", key: "t1" },
      ]);
    });

    it("finds them whatever the case asked for", async () => {
      expect(await store.artifactsWith("NLP")).toHaveLength(3);
    });
  });

  describe("rename", () => {
    beforeEach(async () => {
      await store.setLabels("prompt", "p1", ["nlp", "draft"]);
      await store.setLabels("prompt", "p2", ["nlp"]);
    });

    it("changes it everywhere and says how many were touched", async () => {
      expect(await store.rename("nlp", "language")).toBe(2);
      expect(await store.labelsFor("prompt", "p1")).toEqual(["draft", "language"]);
      expect(await store.labelsFor("prompt", "p2")).toEqual(["language"]);
    });

    it("merges into an existing label rather than failing", async () => {
      // Renaming one label onto another is how two names for one thing get
      // reconciled, and it is the case a plain UPDATE breaks on the primary key.
      expect(await store.rename("nlp", "draft")).toBe(2);
      expect(await store.labelsFor("prompt", "p1")).toEqual(["draft"]);
      expect(await store.labelsFor("prompt", "p2")).toEqual(["draft"]);
    });

    it("matches the old name whatever its case", async () => {
      await store.rename("NLP", "language");
      expect(await store.labelsFor("prompt", "p2")).toEqual(["language"]);
    });

    it("normalises the new name", async () => {
      await store.rename("nlp", "  Natural   Language  ");
      expect(await store.labelsFor("prompt", "p2")).toEqual(["Natural Language"]);
    });

    it("refuses to rename to nothing", async () => {
      await expect(store.rename("nlp", "   ")).rejects.toThrow();
      expect(await store.labelsFor("prompt", "p2")).toEqual(["nlp"]);
    });

    it("touches nothing when the label is not in use", async () => {
      expect(await store.rename("absent", "whatever")).toBe(0);
    });
  });

  describe("remove", () => {
    beforeEach(async () => {
      await store.setLabels("prompt", "p1", ["nlp", "draft"]);
      await store.setLabels("prompt", "p2", ["nlp"]);
    });

    it("takes it off everything and says how many", async () => {
      expect(await store.remove("nlp")).toBe(2);
      expect(await store.labelsFor("prompt", "p1")).toEqual(["draft"]);
      expect(await store.labelsFor("prompt", "p2")).toEqual([]);
    });

    it("leaves the other labels alone", async () => {
      await store.remove("nlp");
      expect(await store.labelsFor("prompt", "p1")).toEqual(["draft"]);
    });

    it("matches whatever the case", async () => {
      expect(await store.remove("NLP")).toBe(2);
    });

    it("reports nothing removed for a label nobody has", async () => {
      expect(await store.remove("absent")).toBe(0);
    });
  });
});
