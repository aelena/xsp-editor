import { databasePath, isLoopbackHost, loadConfig } from "./config.js";
import { buildApp, createAuthStore, createLabelStore, createStorage } from "./index.js";
import { seedDefaults } from "./seed.js";

async function main() {
  const config = loadConfig();
  const { adapter, audit } = createStorage(config);
  const auth = createAuthStore(config, adapter);
  const app = buildApp(adapter, audit, auth, createLabelStore(adapter));

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

  if (config.authRequired) {
    const users = await auth.store.countUsers();
    console.log(
      users === 0
        ? "Auth: on. No account yet, so the first thing to do is create one."
        : `Auth: on. ${users} account${users === 1 ? "" : "s"}.`,
    );
  } else if (!isLoopbackHost(config.host)) {
    // Turning it off here was explicit, so this does not refuse to start. It
    // does say plainly what is now true, because an unauthenticated API that
    // reads and writes local files, reachable from the network, is not a thing
    // to discover later.
    console.warn(
      `WARNING: listening on ${config.host} with authentication off. ` +
        "Anyone who can reach this port can read and write your prompts and " +
        "browse the filesystem. Set XSP_AUTH=on, or bind to 127.0.0.1.",
    );
  }

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`Server listening on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
