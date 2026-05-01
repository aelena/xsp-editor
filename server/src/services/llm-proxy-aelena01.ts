export interface LLMConfig {
  provider: "anthropic" | "openai" | "azure-openai" | "custom";
  model: string;
  api_key: string;
  default_max_tokens: number;
  default_temperature: number;
  custom_base_url?: string | null;
}

export interface LLMCallOptions {
  prompt: string;
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface LLMCallResult {
  response: string;
  model: string;
  tokens: { input: number; output: number; total: number };
  latency_ms: number;
  output_validation: { is_valid_json: boolean; parsed: unknown | null };
}

// In-memory config store (persisted per server lifetime)
let currentConfig: LLMConfig | null = null;

export function getLLMConfig(): LLMConfig | null {
  return currentConfig;
}

export function setLLMConfig(config: LLMConfig): void {
  currentConfig = config;
}

export async function testConnection(config: LLMConfig): Promise<boolean> {
  try {
    const result = await callLLM(config, {
      prompt: "Say 'ok'",
      max_tokens: 10,
      temperature: 0,
    });
    return result.response.length > 0;
  } catch {
    return false;
  }
}

export async function callLLM(
  config: LLMConfig,
  options: LLMCallOptions,
): Promise<LLMCallResult> {
  const model = options.model || config.model;
  const max_tokens = options.max_tokens || config.default_max_tokens;
  const temperature = options.temperature ?? config.default_temperature;

  const start = Date.now();

  let response: string;
  let inputTokens: number;
  let outputTokens: number;

  try {
    if (config.provider === "anthropic") {
      const result = await callAnthropic(config, options.prompt, model, max_tokens, temperature);
      response = result.response;
      inputTokens = result.input_tokens;
      outputTokens = result.output_tokens;
    } else if (config.provider === "openai" || config.provider === "azure-openai" || config.provider === "custom") {
      const result = await callOpenAICompatible(config, options.prompt, model, max_tokens, temperature);
      response = result.response;
      inputTokens = result.input_tokens;
      outputTokens = result.output_tokens;
    } else {
      throw new Error(`Unsupported provider: ${config.provider}`);
    }
  } catch (err) {
    if (err instanceof TypeError && (err as NodeJS.ErrnoException).cause) {
      // Network-level errors (DNS, connection refused, timeout)
      const cause = (err as NodeJS.ErrnoException).cause as { code?: string };
      throw new Error(
        `Failed to connect to ${config.provider} API: ${cause.code || err.message}`,
      );
    }
    throw err;
  }

  const latency_ms = Date.now() - start;

  // Attempt JSON validation
  let is_valid_json = false;
  let parsed: unknown | null = null;
  try {
    parsed = JSON.parse(response);
    is_valid_json = true;
  } catch {
    // Not JSON, that's fine
  }

  return {
    response,
    model,
    tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
    latency_ms,
    output_validation: { is_valid_json, parsed },
  };
}

async function callAnthropic(
  config: LLMConfig,
  prompt: string,
  model: string,
  max_tokens: number,
  temperature: number,
): Promise<{ response: string; input_tokens: number; output_tokens: number }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.api_key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens,
      temperature,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  return {
    response: data.content.map((c) => c.text).join(""),
    input_tokens: data.usage.input_tokens,
    output_tokens: data.usage.output_tokens,
  };
}

async function callOpenAICompatible(
  config: LLMConfig,
  prompt: string,
  model: string,
  max_tokens: number,
  temperature: number,
): Promise<{ response: string; input_tokens: number; output_tokens: number }> {
  let baseUrl: string;
  if (config.provider === "custom" && config.custom_base_url) {
    baseUrl = config.custom_base_url.replace(/\/$/, "");
  } else if (config.provider === "azure-openai" && config.custom_base_url) {
    baseUrl = config.custom_base_url.replace(/\/$/, "");
  } else {
    baseUrl = "https://api.openai.com/v1";
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.api_key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens,
      temperature,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI-compatible API error ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    response: data.choices[0]?.message?.content || "",
    input_tokens: data.usage?.prompt_tokens || 0,
    output_tokens: data.usage?.completion_tokens || 0,
  };
}
