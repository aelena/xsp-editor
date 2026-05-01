import { loadConfig } from "./config.js";
import { MemoryStorageAdapter } from "./storage/memory.js";
import { buildApp } from "./index.js";
import { seedDefaults } from "./seed.js";
import { setLLMConfig } from "./services/llm-proxy.js";

async function main() {
  const config = loadConfig();
  const adapter = new MemoryStorageAdapter();
  const app = buildApp({ storage: adapter, config });

  await seedDefaults(adapter);

  // Seed LLM config from environment variables
  if (config.llmApiKeyAnthropic || config.llmApiKeyOpenai) {
    const provider = (config.llmDefaultProvider as "anthropic" | "openai") ||
      (config.llmApiKeyAnthropic ? "anthropic" : "openai");
    const apiKey = provider === "anthropic"
      ? config.llmApiKeyAnthropic!
      : config.llmApiKeyOpenai!;
    const model = config.llmDefaultModel ||
      (provider === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o");

    setLLMConfig({
      provider,
      model,
      api_key: apiKey,
      default_max_tokens: 1024,
      default_temperature: 0,
    });

    console.log(`LLM config loaded from environment (provider: ${provider})`);
  }

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    console.log(`Server listening on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
