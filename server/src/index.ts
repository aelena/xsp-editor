import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { MemoryStorageAdapter } from "./storage/memory.js";
import { registerPromptRoutes } from "./routes/prompts.js";
import type { StorageAdapter } from "./storage/adapter.js";

export function buildApp(storage?: StorageAdapter) {
  const app = Fastify({ logger: true });
  const adapter = storage || new MemoryStorageAdapter();

  registerPromptRoutes(app, adapter);

  return app;
}

async function main() {
  const config = loadConfig();
  const app = buildApp();

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    console.log(`Server listening on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only run if this is the main module
const isMainModule =
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMainModule) {
  main();
}
