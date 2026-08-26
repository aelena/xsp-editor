import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { StorageAdapter } from "../storage/adapter.js";
import type { AuditLog } from "../services/audit.js";
import type { LabelStore } from "../storage/label-store.js";
import {
  BUNDLE_FORMAT,
  bundleSchema,
  exportBundle,
  importBundle,
} from "../services/bundle.js";

const importQuerySchema = z.object({
  on_conflict: z.enum(["skip", "overwrite"]).optional().default("skip"),
  dry_run: z.enum(["true", "false", "1", "0", ""]).optional(),
});

export function registerBundleRoutes(
  app: FastifyInstance,
  storage: StorageAdapter,
  labels: LabelStore,
  audit: AuditLog,
): void {
  /**
   * Everything, as one JSON document.
   *
   * A filename is suggested rather than left to the browser, because the default
   * would be "export" and three of those in a downloads folder are
   * indistinguishable.
   */
  app.get("/api/v1/export", async (_request, reply) => {
    const bundle = await exportBundle(storage, labels, audit);
    const stamp = bundle.exported_at.slice(0, 19).replace(/[:T]/g, "-");
    return reply
      .header("content-type", "application/json; charset=utf-8")
      .header("content-disposition", `attachment; filename="xsp-export-${stamp}.json"`)
      .send(bundle);
  });

  /**
   * Apply a bundle.
   *
   * Defaults are the cautious ones: skip anything that already exists. An import
   * that overwrites by default is an import that eats somebody's afternoon the
   * first time they try it on the wrong instance.
   *
   * `dry_run=true` reports what would happen and writes nothing. Same code path,
   * so the plan cannot describe something different from what the real run does.
   */
  app.post("/api/v1/import", async (request, reply) => {
    const query = importQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: "on_conflict must be skip or overwrite" });
    }

    const parsed = bundleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: `Not a bundle this build recognises. Expected format ${BUNDLE_FORMAT}.`,
        details: parsed.error.issues.slice(0, 5),
      });
    }

    const dryRun = query.data.dry_run === "true" || query.data.dry_run === "1";

    try {
      const plan = await importBundle(storage, labels, parsed.data, {
        onConflict: query.data.on_conflict,
        dryRun,
      });
      return reply.send({ dry_run: dryRun, on_conflict: query.data.on_conflict, ...plan });
    } catch (err) {
      // A format mismatch is the caller's problem to fix, not a server fault.
      return reply.status(400).send({ error: (err as Error).message });
    }
  });
}
