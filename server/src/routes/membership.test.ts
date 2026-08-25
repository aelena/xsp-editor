import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../index.js";
import { MemoryStorageAdapter } from "../storage/memory.js";
import { createMemoryAuditLog } from "../services/audit.js";
import { seedDefaults } from "../seed.js";
import {
  ARCHIVE_PROJECT_ID,
  GENERAL_PROJECT_ID,
} from "../schemas/projects.js";

/**
 * The rules from the brief, one test each. They are written against HTTP rather
 * than the pure functions in services/membership.ts because these are the
 * transitions a user can actually reach, and the wiring between rule and route
 * is where a correct rule still produces the wrong behaviour.
 */

let app: ReturnType<typeof buildApp>;
let audit: ReturnType<typeof createMemoryAuditLog>;

beforeEach(async () => {
  const storage = new MemoryStorageAdapter();
  await seedDefaults(storage);
  audit = createMemoryAuditLog();
  app = buildApp(storage, audit);
});

async function createProject(name: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/projects",
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return res.json().id;
}

async function createPrompt(name: string, projectId?: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/prompts",
    payload: {
      name,
      description: "A prompt for testing membership",
      content: "<task>Do the thing</task>",
      ...(projectId ? { project_id: projectId } : {}),
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json().id;
}

async function membership(id: string): Promise<string[]> {
  const res = await app.inject({ method: "GET", url: `/api/v1/prompts/${id}` });
  expect(res.statusCode).toBe(200);
  return res.json().projects;
}

async function addTo(id: string, projectId: string) {
  return app.inject({
    method: "POST",
    url: `/api/v1/prompts/${id}/projects`,
    payload: { project_id: projectId },
  });
}

async function removeFrom(id: string, projectId: string, orphans?: string) {
  const query = orphans ? `?orphans=${orphans}` : "";
  return app.inject({
    method: "DELETE",
    url: `/api/v1/prompts/${id}/projects/${projectId}${query}`,
  });
}

describe("the reserved projects", () => {
  it("exist from the start", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/projects" });
    const names = res.json().projects.map((p: { name: string }) => p.name);
    expect(names).toContain("General");
    expect(names).toContain("Archive");
  });

  it("cannot be deleted", async () => {
    for (const id of [GENERAL_PROJECT_ID, ARCHIVE_PROJECT_ID]) {
      const res = await app.inject({ method: "DELETE", url: `/api/v1/projects/${id}` });
      expect(res.statusCode).toBe(409);
    }
  });

  it("cannot be renamed", async () => {
    // Renaming General would leave the UI explaining a concept by a name
    // nothing else in the system uses.
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${GENERAL_PROJECT_ID}`,
      payload: { name: "Everything" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("come before the user's projects in the listing", async () => {
    await createProject("Aardvark");
    const res = await app.inject({ method: "GET", url: "/api/v1/projects" });
    const projects = res.json().projects as { name: string; is_reserved: boolean }[];
    expect(projects[0].is_reserved).toBe(true);
    expect(projects.at(-1)!.name).toBe("Aardvark");
  });
});

describe("a prompt with no project", () => {
  it("belongs to General", async () => {
    const id = await createPrompt("no-project");
    expect(await membership(id)).toEqual([GENERAL_PROJECT_ID]);
  });

  it("belongs only to the project it was created in", async () => {
    // Not "that project and General": General means "belongs to nothing else",
    // so being in both by default would make it meaningless.
    const project = await createProject("Serrin");
    const id = await createPrompt("in-serrin", project);
    expect(await membership(id)).toEqual([project]);
  });
});

describe("belonging to several projects at once", () => {
  it("adds without disturbing the others", async () => {
    const a = await createProject("Alpha");
    const b = await createProject("Beta");
    const id = await createPrompt("multi");

    await addTo(id, a);
    await addTo(id, b);

    expect(await membership(id)).toEqual([GENERAL_PROJECT_ID, a, b].sort());
  });

  it("refuses a project that does not exist", async () => {
    const id = await createPrompt("multi");
    const res = await addTo(id, "11111111-0000-4000-8000-000000000009");
    expect(res.statusCode).toBe(404);
  });

  it("reports which projects a prompt belongs to, by name", async () => {
    // The editor draws labels, so it should not have to join two lists itself.
    const a = await createProject("Alpha");
    const id = await createPrompt("labelled");
    await addTo(id, a);

    const res = await app.inject({ method: "GET", url: `/api/v1/prompts/${id}/projects` });
    const names = res.json().projects.map((p: { name: string }) => p.name);
    expect(names).toContain("General");
    expect(names).toContain("Alpha");
    expect(res.json().archived).toBe(false);
  });
});

describe("removing a prompt from a project", () => {
  it("leaves it in the others", async () => {
    const a = await createProject("Alpha");
    const id = await createPrompt("multi");
    await addTo(id, a);

    const res = await removeFrom(id, a);
    expect(res.statusCode).toBe(200);
    expect(await membership(id)).toEqual([GENERAL_PROJECT_ID]);
  });

  it("can be removed from General and stay in its other projects", async () => {
    const a = await createProject("Alpha");
    const id = await createPrompt("multi");
    await addTo(id, a);

    const res = await removeFrom(id, GENERAL_PROJECT_ID);
    expect(res.statusCode).toBe(200);
    expect(await membership(id)).toEqual([a]);
  });

  it("asks rather than guessing when it is the last project", async () => {
    const id = await createPrompt("only-general");
    const res = await removeFrom(id, GENERAL_PROJECT_ID);

    expect(res.statusCode).toBe(409);
    expect(res.json().requires).toBe("archive_or_general");
    // And nothing changed while the question is unanswered.
    expect(await membership(id)).toEqual([GENERAL_PROJECT_ID]);
  });

  it("archives when that is the answer", async () => {
    const id = await createPrompt("only-general");
    const res = await removeFrom(id, GENERAL_PROJECT_ID, "archive");

    expect(res.statusCode).toBe(200);
    expect(await membership(id)).toEqual([ARCHIVE_PROJECT_ID]);
  });

  it("stays in General when archiving is declined", async () => {
    const id = await createPrompt("only-general");
    const res = await removeFrom(id, GENERAL_PROJECT_ID, "general");

    expect(res.statusCode).toBe(200);
    expect(await membership(id)).toEqual([GENERAL_PROJECT_ID]);
  });

  it("refuses to remove a project the prompt is not in", async () => {
    const a = await createProject("Alpha");
    const id = await createPrompt("elsewhere");
    expect((await removeFrom(id, a)).statusCode).toBe(404);
  });
});

describe("Archive", () => {
  it("clears every other membership", async () => {
    // A retired prompt still listed under three live projects is not retired.
    const a = await createProject("Alpha");
    const b = await createProject("Beta");
    const id = await createPrompt("busy");
    await addTo(id, a);
    await addTo(id, b);

    const res = await app.inject({ method: "POST", url: `/api/v1/prompts/${id}/archive` });
    expect(res.statusCode).toBe(200);
    expect(await membership(id)).toEqual([ARCHIVE_PROJECT_ID]);
  });

  it("hides the prompt from the default listing but not from GET", async () => {
    const id = await createPrompt("retired");
    await app.inject({ method: "POST", url: `/api/v1/prompts/${id}/archive` });

    const list = await app.inject({ method: "GET", url: "/api/v1/prompts" });
    expect(list.json().prompts.map((p: { id: string }) => p.id)).not.toContain(id);

    const one = await app.inject({ method: "GET", url: `/api/v1/prompts/${id}` });
    expect(one.statusCode).toBe(200);
  });

  it("shows archived prompts when asked for", async () => {
    const id = await createPrompt("retired");
    await app.inject({ method: "POST", url: `/api/v1/prompts/${id}/archive` });

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/prompts?include_archived=true",
    });
    expect(list.json().prompts.map((p: { id: string }) => p.id)).toContain(id);
  });

  it("lets a prompt come back out, into General", async () => {
    const id = await createPrompt("returning");
    await app.inject({ method: "POST", url: `/api/v1/prompts/${id}/archive` });

    const res = await app.inject({ method: "POST", url: `/api/v1/prompts/${id}/unarchive` });
    expect(res.statusCode).toBe(200);
    expect(await membership(id)).toEqual([GENERAL_PROJECT_ID]);
  });

  it("refuses to unarchive something that is not archived", async () => {
    const id = await createPrompt("live");
    expect(
      (await app.inject({ method: "POST", url: `/api/v1/prompts/${id}/unarchive` })).statusCode,
    ).toBe(409);
  });

  it("takes a prompt out of Archive when it is added to a live project", async () => {
    // Putting something back into service is one intention, so it should not
    // take two steps.
    const a = await createProject("Alpha");
    const id = await createPrompt("revived");
    await app.inject({ method: "POST", url: `/api/v1/prompts/${id}/archive` });

    const res = await addTo(id, a);
    expect(res.statusCode).toBe(200);
    expect(res.json().unarchived).toBe(true);
    expect(await membership(id)).toEqual([a]);
  });
});

describe("deleting a project", () => {
  it("does not touch members that have another project", async () => {
    const a = await createProject("Doomed");
    const id = await createPrompt("housed");
    await addTo(id, a);

    const res = await app.inject({ method: "DELETE", url: `/api/v1/projects/${a}` });
    expect(res.statusCode).toBe(204);
    expect(await membership(id)).toEqual([GENERAL_PROJECT_ID]);
  });

  it("asks before orphaning anyone", async () => {
    const a = await createProject("Doomed");
    const id = await createPrompt("only-here", a);

    const res = await app.inject({ method: "DELETE", url: `/api/v1/projects/${a}` });
    expect(res.statusCode).toBe(409);
    expect(res.json().orphan_count).toBe(1);
    // Nothing moved while the question is unanswered, and the project is still
    // there so the user can answer and retry.
    expect(await membership(id)).toEqual([a]);
    expect(
      (await app.inject({ method: "GET", url: `/api/v1/projects/${a}` })).statusCode,
    ).toBe(200);
  });

  it("does not ask when nothing would be orphaned", async () => {
    const a = await createProject("Doomed");
    const id = await createPrompt("housed");
    await addTo(id, a);

    const count = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${a}/orphan-count`,
    });
    expect(count.json()).toEqual({ orphan_count: 0, member_count: 1 });
    expect(
      (await app.inject({ method: "DELETE", url: `/api/v1/projects/${a}` })).statusCode,
    ).toBe(204);
  });

  it("archives the orphans when that is the answer", async () => {
    const a = await createProject("Doomed");
    const id = await createPrompt("only-here", a);

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${a}?orphans=archive`,
    });
    expect(res.statusCode).toBe(204);
    expect(await membership(id)).toEqual([ARCHIVE_PROJECT_ID]);
  });

  it("moves the orphans back to General when that is the answer", async () => {
    const a = await createProject("Doomed");
    const id = await createPrompt("only-here", a);

    await app.inject({ method: "DELETE", url: `/api/v1/projects/${a}?orphans=general` });
    expect(await membership(id)).toEqual([GENERAL_PROJECT_ID]);
  });

  it("applies the one answer differently per member", async () => {
    // This is the property that made the brief's two paragraphs consistent: the
    // same deletion archives the prompt that has nowhere else to go and leaves
    // the one that does exactly where it was.
    const a = await createProject("Doomed");
    const b = await createProject("Safe");
    const orphan = await createPrompt("orphan", a);
    const housed = await createPrompt("housed", a);
    await addTo(housed, b);

    await app.inject({ method: "DELETE", url: `/api/v1/projects/${a}?orphans=archive` });

    expect(await membership(orphan)).toEqual([ARCHIVE_PROJECT_ID]);
    expect(await membership(housed)).toEqual([b]);
  });

  it("refuses a nonsense answer", async () => {
    const a = await createProject("Doomed");
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${a}?orphans=incinerate`,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("forking", () => {
  it("copies the content and the memberships into a new prompt", async () => {
    const a = await createProject("Alpha");
    const id = await createPrompt("original");
    await addTo(id, a);

    const res = await app.inject({ method: "POST", url: `/api/v1/prompts/${id}/fork` });
    expect(res.statusCode).toBe(201);
    const fork = res.json();

    expect(fork.id).not.toBe(id);
    expect(fork.content).toBe((await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${id}`,
    })).json().content);
    expect(fork.projects).toEqual([GENERAL_PROJECT_ID, a].sort());
  });

  it("starts its own version history rather than inheriting one", async () => {
    const id = await createPrompt("original");
    await app.inject({
      method: "PUT",
      url: `/api/v1/prompts/${id}`,
      payload: { content: "<task>Changed</task>", version_bump: "minor" },
    });

    const fork = (await app.inject({
      method: "POST",
      url: `/api/v1/prompts/${id}/fork`,
    })).json();

    expect(fork.version).toBe("1.0.0");
    const versions = (await app.inject({
      method: "GET",
      url: `/api/v1/prompts/${fork.id}/versions`,
    })).json().versions;
    expect(versions).toHaveLength(1);
  });

  it("records immutable provenance", async () => {
    const id = await createPrompt("original");
    const fork = (await app.inject({
      method: "POST",
      url: `/api/v1/prompts/${id}/fork`,
    })).json();

    expect(fork.forked_from).toEqual({ id, name: "original", version: "1.0.0" });
  });

  it("takes a name when given one", async () => {
    const id = await createPrompt("original");
    const fork = (await app.inject({
      method: "POST",
      url: `/api/v1/prompts/${id}/fork`,
      payload: { name: "variant-b" },
    })).json();

    expect(fork.name).toBe("variant-b");
  });

  it("yields a live copy when forking something archived", async () => {
    // Archive is a state of one artifact, not a property of its content, so this
    // is how a retired prompt is revived without disturbing the record of its
    // retirement.
    const id = await createPrompt("retired");
    await app.inject({ method: "POST", url: `/api/v1/prompts/${id}/archive` });

    const fork = (await app.inject({
      method: "POST",
      url: `/api/v1/prompts/${id}/fork`,
    })).json();

    expect(fork.projects).toEqual([GENERAL_PROJECT_ID]);
    // And the source stays retired.
    expect(await membership(id)).toEqual([ARCHIVE_PROJECT_ID]);
  });
});

describe("built-in templates", () => {
  it("cannot be archived", async () => {
    const templates = (await app.inject({ method: "GET", url: "/api/v1/templates" })).json()
      .templates as { name: string; is_builtin: boolean }[];
    const builtin = templates.find((t) => t.is_builtin);
    expect(builtin, "the seeder should ship at least one built-in").toBeDefined();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/templates/${builtin!.name}/archive`,
    });
    expect(res.statusCode).toBe(409);
  });

  it("can be forked, and the fork is the user's own", async () => {
    const templates = (await app.inject({ method: "GET", url: "/api/v1/templates" })).json()
      .templates as { name: string; is_builtin: boolean }[];
    const builtin = templates.find((t) => t.is_builtin)!;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/templates/${builtin.name}/fork`,
      payload: { name: "my-own-version" },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().is_builtin).toBe(false);
    expect(res.json().projects).toEqual([GENERAL_PROJECT_ID]);
  });

  it("refuses a fork whose name is taken", async () => {
    const templates = (await app.inject({ method: "GET", url: "/api/v1/templates" })).json()
      .templates as { name: string; is_builtin: boolean }[];
    const builtin = templates.find((t) => t.is_builtin)!;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/templates/${builtin.name}/fork`,
      payload: { name: builtin.name },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("the audit trail", () => {
  it("records creation", async () => {
    const id = await createPrompt("audited");
    const entries = await audit.read(id);
    expect(entries.map((e) => e.operation)).toEqual(["created"]);
    expect(entries[0].before).toEqual([]);
    expect(entries[0].after).toEqual([GENERAL_PROJECT_ID]);
  });

  it("records both sides of every move, not a delta", async () => {
    const a = await createProject("Alpha");
    const id = await createPrompt("audited");
    await addTo(id, a);

    const move = (await audit.read(id)).find((e) => e.operation === "added_to")!;
    expect(move.before).toEqual([GENERAL_PROJECT_ID]);
    expect(move.after).toEqual([GENERAL_PROJECT_ID, a].sort());
  });

  it("leaves a chain where each entry's before matches the last one's after", async () => {
    // This is what makes a missing entry detectable, which is the whole reason
    // for storing both sides.
    const a = await createProject("Alpha");
    const id = await createPrompt("audited");
    await addTo(id, a);
    await removeFrom(id, GENERAL_PROJECT_ID);
    await app.inject({ method: "POST", url: `/api/v1/prompts/${id}/archive` });

    const entries = await audit.read(id);
    expect(entries.length).toBeGreaterThan(3);
    for (let i = 1; i < entries.length; i += 1) {
      expect(entries[i].before, `entry ${i} (${entries[i].operation})`).toEqual(
        entries[i - 1].after,
      );
    }
  });

  it("records what archiving cleared, so it could be restored later", async () => {
    const a = await createProject("Alpha");
    const id = await createPrompt("audited");
    await addTo(id, a);
    await app.inject({ method: "POST", url: `/api/v1/prompts/${id}/archive` });

    const archived = (await audit.read(id)).find((e) => e.operation === "archived")!;
    expect(archived.detail?.cleared).toContain(a);
  });

  it("records two entries for a fork, one on each side", async () => {
    // The trail has to read correctly from whichever artifact you are looking
    // at, and someone reading the source's history needs to know a copy left.
    const id = await createPrompt("original");
    const fork = (await app.inject({
      method: "POST",
      url: `/api/v1/prompts/${id}/fork`,
    })).json();

    expect((await audit.read(id)).map((e) => e.operation)).toContain("forked_to");
    expect((await audit.read(fork.id)).map((e) => e.operation)).toContain("forked_from");
  });

  it("records two entries when an add also unarchives", async () => {
    const a = await createProject("Alpha");
    const id = await createPrompt("revived");
    await app.inject({ method: "POST", url: `/api/v1/prompts/${id}/archive` });
    await addTo(id, a);

    const operations = (await audit.read(id)).map((e) => e.operation);
    expect(operations).toContain("unarchived");
    expect(operations).toContain("added_to");
  });

  it("records the members moved by a project deletion, and why", async () => {
    const a = await createProject("Doomed");
    const id = await createPrompt("only-here", a);
    await app.inject({ method: "DELETE", url: `/api/v1/projects/${a}?orphans=archive` });

    const entry = (await audit.read(id)).find((e) => e.operation === "archived")!;
    expect(entry.detail?.reason).toBe("project_deleted");
    expect(entry.detail?.project_name).toBe("Doomed");
  });

  it("is reachable through the API", async () => {
    const id = await createPrompt("audited");
    const res = await app.inject({ method: "GET", url: `/api/v1/prompts/${id}/audit` });
    expect(res.statusCode).toBe(200);
    expect(res.json().entries.length).toBeGreaterThan(0);
  });

  it("names the actor honestly", async () => {
    const id = await createPrompt("audited");
    expect((await audit.read(id))[0].actor).toBe("local user");
  });
});

describe("the tree", () => {
  it("hangs prompts and templates off their projects, one level deep", async () => {
    const a = await createProject("Alpha");
    const id = await createPrompt("in-alpha", a);

    const res = await app.inject({ method: "GET", url: "/api/v1/projects/tree" });
    expect(res.statusCode).toBe(200);

    const tree = res.json().tree as {
      project: { id: string; name: string };
      prompts: { id: string }[];
      templates: { name: string }[];
    }[];

    const alpha = tree.find((node) => node.project.id === a)!;
    expect(alpha.prompts.map((p) => p.id)).toEqual([id]);

    const general = tree.find((node) => node.project.id === GENERAL_PROJECT_ID)!;
    expect(general.templates.length).toBeGreaterThan(0);
  });

  it("is not mistaken for a project id", async () => {
    // "tree" sits at the same position as :id, so route order decides whether
    // this endpoint exists at all.
    const res = await app.inject({ method: "GET", url: "/api/v1/projects/tree" });
    expect(res.json()).toHaveProperty("tree");
  });

  it("includes an archived prompt under Archive", async () => {
    const id = await createPrompt("retired");
    await app.inject({ method: "POST", url: `/api/v1/prompts/${id}/archive` });

    const tree = (await app.inject({ method: "GET", url: "/api/v1/projects/tree" })).json()
      .tree as { project: { id: string }; prompts: { id: string }[] }[];
    const archive = tree.find((node) => node.project.id === ARCHIVE_PROJECT_ID)!;
    expect(archive.prompts.map((p) => p.id)).toContain(id);
  });
});

describe("projects that are only a grouping", () => {
  it("can be created without a path", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      payload: { name: "Just A Label" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().path).toBeNull();
  });

  it("refuses two projects with the same name", async () => {
    await createProject("Alpha");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      payload: { name: "alpha" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("answers 400 rather than crashing when asked for git on a project with no folder", async () => {
    const a = await createProject("Just A Label");
    const res = await app.inject({ method: "GET", url: `/api/v1/projects/${a}/git/status` });
    expect(res.statusCode).toBe(400);
  });
});
