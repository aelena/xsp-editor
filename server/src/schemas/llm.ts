import { z } from "zod";

export const llmConfigSchema = z.object({
  provider: z.enum(["anthropic", "openai", "azure-openai", "custom"]),
  model: z.string().min(1),
  api_key: z.string().min(1),
  default_max_tokens: z.number().int().min(1).max(200000).optional().default(1024),
  default_temperature: z.number().min(0).max(2).optional().default(0),
  custom_base_url: z.string().url().optional().nullable(),
});

export const llmTestSchema = z.object({
  content: z.string().min(1),
  variables: z.record(z.string(), z.string()).optional().default({}),
  model_override: z.string().optional().nullable(),
  max_tokens: z.number().int().min(1).max(200000).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export interface LLMConfigResponse {
  provider: string;
  model: string;
  api_key_set: boolean;
  default_max_tokens: number;
  default_temperature: number;
  custom_base_url: string | null;
}

export interface LLMTestResponse {
  response: string;
  model: string;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  latency_ms: number;
  output_validation: {
    is_valid_json: boolean;
    parsed: unknown | null;
  };
}
