import { databasePath, loadConfig } from "./config.js";
import { buildApp, createStorage } from "./index.js";
import { seedDefaults } from "./seed.js";

async function main() {
  const config = loadConfig();
  const { adapter, audit } = createStorage(config);
  const app = buildApp(adapter, audit);

  // Idempotent: it creates the reserved projects and the default vocabulary
  // only when they are missing, so a restart against an existing database adds
  // nothing and overwrites nothing.
  await seedDefaults(adapter);

  // Said out loud at startup, because "where is my data" is the first question
  // anyone asks of a tool that keeps some, and the answer differs per platform.
  if (config.storage === "sqlite") {
    console.log(`Data: ${databasePath(config)}`);
  } else {
    console.log("Storage: in memory. Everything is lost when this process exits.");
  }

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
