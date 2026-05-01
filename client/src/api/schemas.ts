import { z } from 'zod'

// --- Tag schemas ---

export const tagSchema = z.object({
  name: z.string(),
  purpose: z.string(),
  use_when: z.string(),
  example: z.string(),
  enforcement: z.enum(['required', 'recommended', 'optional', 'deprecated']),
  usage_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const listTagsResponseSchema = z.object({
  tags: z.array(tagSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

// --- Constraint schemas ---

export const constraintSchema = z.object({
  id: z.string(),
  description: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.enum(['content', 'safety', 'style', 'structural', 'evidence', 'output']),
  owner: z.string(),
  status: z.enum(['active', 'deprecated', 'retired']),
  xml_block: z.string(),
  usage_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const listConstraintsResponseSchema = z.object({
  constraints: z.array(constraintSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

// --- Prompt schemas ---

export const promptSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  content: z.string(),
  variables: z.record(z.string(), z.object({
    description: z.string(),
    required: z.boolean().optional(),
  })),
  tags_used: z.array(z.string()),
  constraints_referenced: z.array(z.string()),
  author: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  verification_status: z.enum(['passed', 'warnings', 'failed', 'unchecked']),
  metadata: z.record(z.string(), z.string()),
})

export const listPromptsResponseSchema = z.object({
  prompts: z.array(promptSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

// --- Verification schemas ---

export const checkResultSchema = z.object({
  rule: z.string(),
  status: z.enum(['passed', 'warning', 'failed']),
  message: z.string(),
  anti_pattern: z.string().optional(),
  details: z.string().optional(),
})

export const antiPatternResultSchema = z.object({
  pattern: z.string(),
  detected: z.boolean(),
  details: z.string().optional(),
})

export const verificationResultSchema = z.object({
  status: z.enum(['passed', 'warnings', 'failed']),
  score: z.number(),
  checks: z.array(checkResultSchema),
  anti_pattern_scan: z.array(antiPatternResultSchema),
})

// --- LLM schemas ---

export const llmConfigResponseSchema = z.object({
  provider: z.string().nullable(),
  model: z.string().nullable(),
  api_key_set: z.boolean(),
  default_max_tokens: z.number(),
  default_temperature: z.number(),
  custom_base_url: z.string().nullable(),
})

export const llmTestResponseSchema = z.object({
  response: z.string(),
  model: z.string(),
  tokens: z.object({
    input: z.number(),
    output: z.number(),
    total: z.number(),
  }),
  latency_ms: z.number(),
  output_validation: z.object({
    is_valid_json: z.boolean(),
    parsed: z.unknown().nullable(),
  }),
})
