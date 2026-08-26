import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { StorageAdapter } from "../storage/adapter.js";
import type { LabelStore } from "../storage/label-store.js";
import { collectAll } from "../storage/collect.js";

/**
 * One search across everything.
 *
 * Search existed per page and nowhere across, so finding a constraint by a word
 * in its description meant knowing it was a constraint first. That is exactly
 * backwards: you search because you do not know where the thing is.
 *
 * Server-side because it spans six collections, and the client would otherwise
 * fetch all of them to filter locally, which is the same work done further from
 * the data and repeated on every keystroke.
 */

export type SearchKind =
  | "prompt"
  | "template"
  | "tag"
  | "constraint"
  | "project"
  | "label";

export interface SearchHit {
  kind: SearchKind;
  /** What to put in a URL to reach it. */
  key: string;
  title: string;
  /** Why this matched, so a hit list is readable without opening each one. */
  context: string;
  /** Which field matched, so the client can rank or group. */
  field: string;
}

const querySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

/**
 * Rank by where the match landed, not by how many times it occurs.
 *
 * A name that starts with what you typed is almost always what you meant; a word
 * buried in a description almost never is. Counting occurrences would put a long
 * rambling description above an exact name.
 */
function score(needle: string, title: string, field: string): number {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle === needle) return 0;
  if (lowerTitle.startsWith(needle)) return 1;
  if (field === "name" || field === "id") return 2;
  if (field === "label") return 3;
  return 4;
}

export function registerSearchRoutes(
  app: FastifyInstance,
  storage: StorageAdapter,
  labels: LabelStore,
): void {
  app.get("/api/v1/search", async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "q is required, and at most 200 characters" });
    }

    const needle = parsed.data.q.trim().toLowerCase();
    if (needle.length === 0) {
      return reply.send({ query: parsed.data.q, hits: [] });
    }

    const hits: (SearchHit & { rank: number })[] = [];
    const add = (hit: SearchHit) => {
      hits.push({ ...hit, rank: score(needle, hit.title, hit.field) });
    };
    const has = (value: string | undefined | null) =>
      typeof value === "string" && value.toLowerCase().includes(needle);

    // Archived artifacts are searchable. Somebody looking for a prompt they
    // retired is exactly the person who needs to find it.
    const prompts = await collectAll((page, limit) =>
      storage
        .listPrompts({ page, limit, include_archived: true })
        .then((r) => ({ items: r.prompts, total: r.total, page: r.page, limit: r.limit })),
    );

    for (const prompt of prompts) {
      if (has(prompt.name)) {
        add({ kind: "prompt", key: prompt.id, title: prompt.name, context: prompt.description, field: "name" });
      } else if (has(prompt.description)) {
        add({ kind: "prompt", key: prompt.id, title: prompt.name, context: prompt.description, field: "description" });
      } else if (has(prompt.content)) {
        // The body is where the interesting matches are: which prompts mention
        // a constraint, or use a particular element.
        add({
          kind: "prompt",
          key: prompt.id,
          title: prompt.name,
          context: excerpt(prompt.content, needle),
          field: "content",
        });
      }
    }

    for (const template of await storage.listTemplates({ include_archived: true })) {
      if (has(template.name)) {
        add({ kind: "template", key: template.name, title: template.name, context: template.description, field: "name" });
      } else if (has(template.description) || has(template.category)) {
        add({ kind: "template", key: template.name, title: template.name, context: template.description, field: "description" });
      } else if (has(template.content)) {
        add({
          kind: "template",
          key: template.name,
          title: template.name,
          context: excerpt(template.content, needle),
          field: "content",
        });
      }
    }

    for (const tag of await collectAll((page, limit) => storage.listTags({ page, limit }))) {
      if (has(tag.name)) {
        add({ kind: "tag", key: tag.name, title: tag.name, context: tag.purpose, field: "name" });
      } else if (has(tag.purpose) || has(tag.use_when)) {
        add({ kind: "tag", key: tag.name, title: tag.name, context: tag.purpose, field: "purpose" });
      }
    }

    for (const constraint of await collectAll((page, limit) =>
      storage.listConstraints({ page, limit }),
    )) {
      if (has(constraint.id)) {
        add({ kind: "constraint", key: constraint.id, title: constraint.id, context: constraint.description, field: "id" });
      } else if (has(constraint.description) || has(constraint.owner)) {
        add({ kind: "constraint", key: constraint.id, title: constraint.id, context: constraint.description, field: "description" });
      }
    }

    for (const project of await storage.listProjects()) {
      if (has(project.name) || has(project.path)) {
        add({
          kind: "project",
          key: project.id,
          title: project.name,
          context: project.path ?? "No folder on disk",
          field: "name",
        });
      }
    }

    for (const usage of await labels.usage()) {
      if (has(usage.label)) {
        add({
          kind: "label",
          key: usage.label,
          title: usage.label,
          context: `${usage.count} item${usage.count === 1 ? "" : "s"}`,
          field: "label",
        });
      }
    }

    hits.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));

    return reply.send({
      query: parsed.data.q,
      // Reported before the cut, so the client can say there is more rather
      // than implying thirty is all there is.
      total: hits.length,
      hits: hits.slice(0, parsed.data.limit).map(({ rank, ...hit }) => {
        void rank;
        return hit;
      }),
    });
  });
}

/**
 * The line the match is on, trimmed.
 *
 * A hit inside a body is useless without it: "matched somewhere in 4kB of XML"
 * tells the reader nothing they can act on.
 */
function excerpt(content: string, needle: string, width = 120): string {
  const at = content.toLowerCase().indexOf(needle);
  if (at < 0) return "";

  const lineStart = content.lastIndexOf("\n", at) + 1;
  const lineEnd = content.indexOf("\n", at);
  const line = content.slice(lineStart, lineEnd < 0 ? content.length : lineEnd).trim();

  if (line.length <= width) return line;

  // Keep the match visible rather than trimming from the left every time.
  const offset = at - lineStart;
  const from = Math.max(0, offset - Math.floor(width / 2));
  return (from > 0 ? "…" : "") + line.slice(from, from + width).trim() + "…";
}
