import { z } from "zod";

export const renderRequestSchema = z.object({
  content: z.string().min(1),
  variables: z.record(z.string(), z.string()).optional().default({}),
});

export interface RenderResponse {
  rendered: string;
  token_estimate: number;
  unresolved_variables: string[];
}
