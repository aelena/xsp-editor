import { loadConfig } from "./config.js";
import { MemoryStorageAdapter } from "./storage/memory.js";
import { buildApp } from "./index.js";
import { seedDefaults } from "./seed.js";

async function main() {
  const config = loadConfig();
  const adapter = new MemoryStorageAdapter();
  const app = buildApp(adapter);

  await seedDefaults(adapter);

  try {
    const host = process.env.HOST || "127.0.0.1";
    await app.listen({ port: config.port, host });
    console.log(`Server listening on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
