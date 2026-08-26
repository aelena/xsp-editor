import { z } from "zod";
import type { StorageAdapter } from "../storage/adapter.js";
import type { LabelStore } from "../storage/label-store.js";
import { collectAll } from "../storage/collect.js";

/**
 * A portable bundle of everything a person made.
 *
 * This is the backup story and the sharing story at once, which is why it is
 * one file and not two features. Copy it somewhere, or send it to a colleague.
 *
 * The audit trail is exported and never imported. Exporting it means your
 * history travels with your work, which is the whole argument for keeping one.
 * Importing it would mean writing entries claiming that things happened on this
 * instance which did not, and a trail that can be authored is not evidence. So
 * the import says out loud that it skipped them rather than dropping them
 * quietly.
 */

export const BUNDLE_FORMAT = 1;

export interface Bundle {
  format: number;
  exported_at: string;
  /** What produced it, for when a future format needs to know. */
  source: string;
  prompts: unknown[];
  prompt_versions: unknown[];
  templates: unknown[];
  template_versions: unknown[];
  tags: unknown[];
  constraints: unknown[];
  projects: unknown[];
  labels: { kind: string; key: string; labels: string[] }[];
  audit: unknown[];
}

/**
 * Deliberately loose about the contents.
 *
 * The format number is checked strictly and the collections are checked to be
 * arrays; individual records are validated as they are applied, one at a time.
 * A bundle with one malformed prompt should import the other forty and say which
 * one it could not, rather than being rejected whole.
 */
export const bundleSchema = z.object({
  format: z.number().int(),
  exported_at: z.string().optional(),
  source: z.string().optional(),
  prompts: z.array(z.unknown()).optional().default([]),
  prompt_versions: z.array(z.unknown()).optional().default([]),
  templates: z.array(z.unknown()).optional().default([]),
  template_versions: z.array(z.unknown()).optional().default([]),
  tags: z.array(z.unknown()).optional().default([]),
  constraints: z.array(z.unknown()).optional().default([]),
  projects: z.array(z.unknown()).optional().default([]),
  labels: z
    .array(z.object({ kind: z.string(), key: z.string(), labels: z.array(z.string()) }))
    .optional()
    .default([]),
  audit: z.array(z.unknown()).optional().default([]),
});

export type OnConflict = "skip" | "overwrite";

export interface ImportPlan {
  created: number;
  updated: number;
  skipped: number;
  failed: { kind: string; key: string; reason: string }[];
  /** Said out loud rather than left implicit. */
  notes: string[];
}

export async function exportBundle(
  storage: StorageAdapter,
  labels: LabelStore,
  audit: { read(artifactId: string): Promise<unknown[]> },
): Promise<Bundle> {
  // Archived artifacts included: a backup that silently omits what you retired
  // is a backup that loses the thing you kept for traceability.
  const prompts = await collectAll((page, limit) =>
    storage
      .listPrompts({ page, limit, include_archived: true })
      .then((r) => ({ items: r.prompts, total: r.total, page: r.page, limit: r.limit })),
  );
  const templates = await storage.listTemplates({ include_archived: true });

  const promptVersions = (
    await Promise.all(prompts.map((p) => storage.listVersions(p.id)))
  ).flat();
  const templateVersions = (
    await Promise.all(templates.map((t) => storage.listTemplateVersions(t.name)))
  ).flat();

  const [tags, constraints, projects] = await Promise.all([
    collectAll((page, limit) => storage.listTags({ page, limit })),
    collectAll((page, limit) => storage.listConstraints({ page, limit })),
    storage.listProjects(),
  ]);

  const labelRows: Bundle["labels"] = [];
  for (const prompt of prompts) {
    const own = await labels.labelsFor("prompt", prompt.id);
    if (own.length > 0) labelRows.push({ kind: "prompt", key: prompt.id, labels: own });
  }
  for (const template of templates) {
    const own = await labels.labelsFor("template", template.name);
    if (own.length > 0) labelRows.push({ kind: "template", key: template.name, labels: own });
  }

  const auditRows = (
    await Promise.all([
      ...prompts.map((p) => audit.read(p.id)),
      ...templates.map((t) => audit.read(t.name)),
    ])
  ).flat();

  return {
    format: BUNDLE_FORMAT,
    exported_at: new Date().toISOString(),
    source: "xsp-editor",
    prompts,
    prompt_versions: promptVersions,
    templates,
    template_versions: templateVersions,
    tags,
    constraints,
    projects,
    labels: labelRows,
    audit: auditRows,
  };
}

/** What a key is, per collection, so conflicts are detected consistently. */
const KEY_OF: Record<string, (record: Record<string, unknown>) => string> = {
  prompts: (r) => String(r.id ?? ""),
  templates: (r) => String(r.name ?? ""),
  tags: (r) => String(r.name ?? ""),
  constraints: (r) => String(r.id ?? ""),
  projects: (r) => String(r.id ?? ""),
};

/**
 * Apply a bundle, or report what applying it would do.
 *
 * `dryRun` exists because an import writes over somebody's work, and the only
 * honest way to offer that is to say what it will touch first. The same code
 * path produces the plan and does the work, so the plan cannot describe
 * something different from what happens.
 */
export async function importBundle(
  storage: StorageAdapter,
  labels: LabelStore,
  bundle: z.infer<typeof bundleSchema>,
  options: { onConflict: OnConflict; dryRun: boolean },
): Promise<ImportPlan> {
  const plan: ImportPlan = { created: 0, updated: 0, skipped: 0, failed: [], notes: [] };

  if (bundle.format !== BUNDLE_FORMAT) {
    throw new Error(
      `This bundle is format ${bundle.format} and this build reads format ${BUNDLE_FORMAT}.`,
    );
  }

  if (bundle.audit.length > 0) {
    plan.notes.push(
      `${bundle.audit.length} audit entries were not imported. A history that can be ` +
        "written by hand is not evidence; the trail records what happened here.",
    );
  }

  /** One record: does it exist, and what should happen to it. */
  const apply = async <T>(
    collection: string,
    records: unknown[],
    get: (key: string) => Promise<T | null>,
    create: (record: T) => Promise<void>,
    update: (key: string, record: T) => Promise<void>,
  ) => {
    for (const raw of records) {
      if (typeof raw !== "object" || raw === null) {
        plan.failed.push({ kind: collection, key: "?", reason: "not an object" });
        continue;
      }
      const record = raw as Record<string, unknown>;
      const key = KEY_OF[collection](record);
      if (!key) {
        plan.failed.push({ kind: collection, key: "?", reason: "no identifier" });
        continue;
      }

      try {
        const existing = await get(key);
        if (existing && options.onConflict === "skip") {
          plan.skipped += 1;
          continue;
        }
        if (existing) {
          if (!options.dryRun) await update(key, record as T);
          plan.updated += 1;
        } else {
          if (!options.dryRun) await create(record as T);
          plan.created += 1;
        }
      } catch (err) {
        // One bad record should not lose the other forty, and the caller needs
        // to know which one it was.
        plan.failed.push({ kind: collection, key, reason: (err as Error).message });
      }
    }
  };

  // Projects first: a prompt's membership points at them, and importing a
  // membership for a project that is not there yet would drop it.
  await apply(
    "projects",
    bundle.projects,
    (key) => storage.getProject(key),
    (r) => storage.createProject(r as never),
    (key, r) => storage.updateProject(key, r as never),
  );
  await apply(
    "tags",
    bundle.tags,
    (key) => storage.getTag(key),
    (r) => storage.createTag(r as never),
    (key, r) => storage.updateTag(key, r as never),
  );
  await apply(
    "constraints",
    bundle.constraints,
    (key) => storage.getConstraint(key),
    (r) => storage.createConstraint(r as never),
    (key, r) => storage.updateConstraint(key, r as never),
  );
  await apply(
    "templates",
    bundle.templates,
    (key) => storage.getTemplate(key),
    (r) => storage.createTemplate(r as never),
    (key, r) => storage.updateTemplate(key, r as never),
  );
  await apply(
    "prompts",
    bundle.prompts,
    (key) => storage.getPrompt(key),
    (r) => storage.createPrompt(r as never),
    (key, r) => storage.updatePrompt(key, r as never),
  );

  // Versions are keyed by artifact and version together, and an existing pair is
  // the same content by definition, so they are written unconditionally and not
  // counted as conflicts.
  if (!options.dryRun) {
    for (const version of bundle.prompt_versions) {
      try {
        await storage.saveVersion(version as never);
      } catch (err) {
        plan.failed.push({
          kind: "prompt_versions",
          key: String((version as Record<string, unknown>)?.version ?? "?"),
          reason: (err as Error).message,
        });
      }
    }
    for (const version of bundle.template_versions) {
      try {
        await storage.saveTemplateVersion(version as never);
      } catch (err) {
        plan.failed.push({
          kind: "template_versions",
          key: String((version as Record<string, unknown>)?.version ?? "?"),
          reason: (err as Error).message,
        });
      }
    }

    for (const row of bundle.labels) {
      if (row.kind !== "prompt" && row.kind !== "template") continue;
      await labels.setLabels(row.kind, row.key, row.labels);
    }
  }

  return plan;
}
