import type { FastifyInstance } from "fastify";
import { llmConfigSchema, llmTestSchema } from "../schemas/llm.js";
import {
  getLLMConfig,
  setLLMConfig,
  testConnection,
  callLLM,
  type LLMConfig,
} from "../services/llm-proxy.js";
import { renderTemplate } from "../services/renderer.js";

export function registerLLMRoutes(app: FastifyInstance): void {
  // Get current LLM configuration
  app.get("/api/v1/llm/config", async (_request, reply) => {
    const config = getLLMConfig();
    if (!config) {
      return reply.send({
        provider: null,
        model: null,
        api_key_set: false,
        default_max_tokens: 1024,
        default_temperature: 0,
        custom_base_url: null,
      });
    }

    return reply.send({
      provider: config.provider,
      model: config.model,
      api_key_set: true,
      default_max_tokens: config.default_max_tokens,
      default_temperature: config.default_temperature,
      custom_base_url: config.custom_base_url || null,
    });
  });

  // Update LLM configuration
  app.put("/api/v1/llm/config", async (request, reply) => {
    const parseResult = llmConfigSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const existingConfig = getLLMConfig();

    // If the base URL or provider changed, require the API key to be re-entered
    // to prevent exfiltration via SSRF (attacker swaps URL to steal stored key)
    const urlChanged = existingConfig &&
      (parseResult.data.custom_base_url !== (existingConfig.custom_base_url || null) ||
       parseResult.data.provider !== existingConfig.provider);
    const reusingKey = parseResult.data.api_key === "unchanged";

    if (urlChanged && reusingKey) {
      return reply.status(400).send({
        error: "API key must be re-entered when changing provider or base URL",
      });
    }

    const config: LLMConfig = {
      provider: parseResult.data.provider,
      model: parseResult.data.model,
      api_key: reusingKey && existingConfig
        ? existingConfig.api_key
        : parseResult.data.api_key,
      default_max_tokens: parseResult.data.default_max_tokens,
      default_temperature: parseResult.data.default_temperature,
      custom_base_url: parseResult.data.custom_base_url,
    };

    setLLMConfig(config);

    return reply.send({
      provider: config.provider,
      model: config.model,
      api_key_set: true,
      default_max_tokens: config.default_max_tokens,
      default_temperature: config.default_temperature,
      custom_base_url: config.custom_base_url || null,
    });
  });

  // Test connection
  app.post("/api/v1/llm/test-connection", async (_request, reply) => {
    const config = getLLMConfig();
    if (!config) {
      return reply.status(400).send({
        error: "LLM not configured. Set configuration first.",
      });
    }

    const success = await testConnection(config);
    return reply.send({ success });
  });

  // Test a prompt with the configured LLM
  app.post("/api/v1/llm/test", async (request, reply) => {
    const config = getLLMConfig();
    if (!config) {
      return reply.status(400).send({
        error: "LLM not configured. Set configuration first.",
      });
    }

    const parseResult = llmTestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
    }

    const { content, variables, model_override, max_tokens, temperature } =
      parseResult.data;

    // Render template with variables first
    const rendered = renderTemplate(content, variables);

    try {
      const result = await callLLM(config, {
        prompt: rendered.rendered,
        model: model_override || undefined,
        max_tokens: max_tokens || undefined,
        temperature: temperature ?? undefined,
      });

      return reply.send(result);
    } catch (err) {
      return reply.status(502).send({
        error: `LLM call failed: ${(err as Error).message}`,
      });
    }
  });
}
