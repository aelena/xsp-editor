import { readdir, readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { StorageAdapter } from "./storage/adapter.js";
import type { TagRecord } from "./schemas/tags.js";
import type { ConstraintRecord } from "./schemas/constraints.js";
import type { TemplateRecord } from "./schemas/templates.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "templates");

const DEFAULT_TAGS: Omit<TagRecord, "usage_count" | "created_at" | "updated_at">[] = [
  {
    name: "task",
    purpose: "Primary instruction — what the model should do",
    use_when: "Every prompt",
    example: "<task>Summarize the document for executives</task>",
    enforcement: "required",
  },
  {
    name: "context",
    purpose: "Background information the model needs",
    use_when: "When the model needs domain knowledge or situational context",
    example: "<context>The user is a premium subscriber with 3 years of history</context>",
    enforcement: "optional",
  },
  {
    name: "constraints",
    purpose: "Container for behavioral guardrails",
    use_when: "When you need to set boundaries on model behavior",
    example: "<constraints><constraint>No medical advice</constraint></constraints>",
    enforcement: "recommended",
  },
  {
    name: "constraint",
    purpose: "Individual behavioral guardrail",
    use_when: "Inside <constraints> to define a specific rule",
    example: '<constraint id="GEN-001" severity="critical">No fabricated data</constraint>',
    enforcement: "optional",
  },
  {
    name: "input",
    purpose: "User-provided or variable data to process",
    use_when: "When the prompt processes external data",
    example: "<input><![CDATA[$user_message]]></input>",
    enforcement: "recommended",
  },
  {
    name: "output_format",
    purpose: "Expected response shape and structure",
    use_when: "When you need structured or formatted output",
    example: "<output_format>Return valid JSON with keys: category, confidence</output_format>",
    enforcement: "recommended",
  },
  {
    name: "output_contract",
    purpose: "Detailed output specification (alternative to output_format)",
    use_when: "For complex output requirements with multiple sections",
    example: "<output_contract>Structure: 3 sections, each under 200 words</output_contract>",
    enforcement: "optional",
  },
  {
    name: "examples",
    purpose: "Container for few-shot demonstrations",
    use_when: "When examples improve model accuracy",
    example: "<examples><example><input>...</input><output>...</output></example></examples>",
    enforcement: "optional",
  },
  {
    name: "example",
    purpose: "Individual few-shot demonstration",
    use_when: "Inside <examples> to provide a single demonstration",
    example: "<example><input>Hello</input><output>Hi there!</output></example>",
    enforcement: "optional",
  },
  {
    name: "audience",
    purpose: "Target reader or consumer of the output",
    use_when: "When the output style should adapt to a specific audience",
    example: "<audience>C-level executives with limited technical background</audience>",
    enforcement: "optional",
  },
  {
    name: "checks",
    purpose: "Self-verification steps for the model",
    use_when: "When you want the model to validate its own output",
    example: "<checks><check>Verify all claims have citations</check></checks>",
    enforcement: "optional",
  },
  {
    name: "pii_policy",
    purpose: "PII handling rules",
    use_when: "When processing data that may contain personally identifiable information",
    example: "<pii_policy>Redact all names, replace with [NAME]</pii_policy>",
    enforcement: "optional",
  },
  {
    name: "untrusted_input",
    purpose: "Explicitly marked untrusted content (injection defense)",
    use_when: "When processing user-generated content that could contain prompt injection",
    example: "<untrusted_input><![CDATA[$user_message]]></untrusted_input>",
    enforcement: "optional",
  },
];

const DEFAULT_CONSTRAINTS: Omit<ConstraintRecord, "usage_count" | "created_at" | "updated_at">[] = [
  {
    id: "GEN-001",
    description: "No fabricated information — only what is in the provided input",
    severity: "critical",
    category: "content",
    owner: "",
    status: "active",
    xml_block: '<constraint id="GEN-001" severity="critical">\n  No fabricated information — only extract or reference what is explicitly present in the provided input.\n</constraint>',
  },
  {
    id: "GEN-002",
    description: "If information is unavailable, say so — do not guess",
    severity: "high",
    category: "content",
    owner: "",
    status: "active",
    xml_block: '<constraint id="GEN-002" severity="high">\n  If information is unavailable or uncertain, state that clearly. Do not guess or speculate.\n</constraint>',
  },
  {
    id: "GEN-003",
    description: "No preamble or meta-commentary in output",
    severity: "medium",
    category: "output",
    owner: "",
    status: "active",
    xml_block: '<constraint id="GEN-003" severity="medium">\n  No preamble, meta-commentary, or filler phrases. Begin directly with the requested content.\n</constraint>',
  },
  {
    id: "PII-001",
    description: "Never include names, emails, phone numbers, or other PII in output",
    severity: "critical",
    category: "safety",
    owner: "",
    status: "active",
    xml_block: '<constraint id="PII-001" severity="critical">\n  Never include personal names, email addresses, phone numbers, addresses, or other personally identifiable information in the output.\n</constraint>',
  },
  {
    id: "PII-002",
    description: "If referencing a person, use generic terms: \"the customer\", \"the user\"",
    severity: "high",
    category: "safety",
    owner: "",
    status: "active",
    xml_block: '<constraint id="PII-002" severity="high">\n  When referencing individuals, use generic terms such as "the customer", "the user", or "the applicant" instead of names.\n</constraint>',
  },
  {
    id: "MED-001",
    description: "Never provide medical diagnoses or treatment recommendations",
    severity: "critical",
    category: "safety",
    owner: "compliance-team",
    status: "active",
    xml_block: '<constraint id="MED-001" severity="critical">\n  Never provide medical diagnoses or treatment recommendations.\n  If asked, respond: "Please consult a licensed healthcare provider."\n</constraint>',
  },
  {
    id: "LEGAL-001",
    description: "Never provide legal advice or conclusions",
    severity: "critical",
    category: "safety",
    owner: "compliance-team",
    status: "active",
    xml_block: '<constraint id="LEGAL-001" severity="critical">\n  Never provide legal advice, legal conclusions, or interpretations of law.\n  If asked, respond: "Please consult a qualified legal professional."\n</constraint>',
  },
  {
    id: "TONE-001",
    description: "Use restrained professional tone — no marketing superlatives",
    severity: "medium",
    category: "style",
    owner: "",
    status: "active",
    xml_block: '<constraint id="TONE-001" severity="medium">\n  Use a restrained, professional tone. Avoid marketing superlatives, exclamation marks, and hyperbolic language.\n</constraint>',
  },
  {
    id: "FORMAT-001",
    description: "Output must be valid JSON — no markdown fences, no extra text",
    severity: "high",
    category: "output",
    owner: "",
    status: "active",
    xml_block: '<constraint id="FORMAT-001" severity="high">\n  Output must be valid JSON. Do not wrap in markdown code fences. Do not include any text before or after the JSON object.\n</constraint>',
  },
  {
    id: "FORMAT-002",
    description: "Use null for unknown fields, empty array for no results",
    severity: "medium",
    category: "output",
    owner: "",
    status: "active",
    xml_block: '<constraint id="FORMAT-002" severity="medium">\n  Use null for fields where the value is unknown or not found. Use an empty array [] when no results match.\n</constraint>',
  },
];

const TEMPLATE_DESCRIPTIONS: Record<string, { description: string; category: string }> = {
  baseline: {
    description: "Standard XSP template with task, context, constraints, input, output, examples, and checks",
    category: "general",
  },
  longform: {
    description: "Deep content with VCO framework: topic, audience, voice, source policy, output contract",
    category: "content",
  },
  extraction: {
    description: "Structured data extraction with field definitions and JSON output",
    category: "data",
  },
  summarization: {
    description: "Constrained summarization with audience targeting",
    category: "content",
  },
  "customer-support": {
    description: "Customer-facing with injection defense layers and PII constraints",
    category: "safety",
  },
};

export async function seedDefaults(storage: StorageAdapter): Promise<void> {
  // Seed tags if none exist
  const existingTagsResult = await storage.listTags({ page: 1, limit: 1 });
  if (existingTagsResult.total === 0) {
    const now = new Date().toISOString();
    for (const tag of DEFAULT_TAGS) {
      await storage.createTag({
        ...tag,
        usage_count: 0,
        created_at: now,
        updated_at: now,
      });
    }
    console.log(`Seeded ${DEFAULT_TAGS.length} default tags`);
  }

  // Seed constraints if none exist
  const existingConstraintsResult = await storage.listConstraints({ page: 1, limit: 1 });
  if (existingConstraintsResult.total === 0) {
    const now = new Date().toISOString();
    for (const constraint of DEFAULT_CONSTRAINTS) {
      await storage.createConstraint({
        ...constraint,
        usage_count: 0,
        created_at: now,
        updated_at: now,
      });
    }
    console.log(`Seeded ${DEFAULT_CONSTRAINTS.length} default constraints`);
  }

  // Seed templates if none exist
  const existingTemplates = await storage.listTemplates();
  if (existingTemplates.length === 0) {
    const now = new Date().toISOString();
    try {
      const items = await readdir(TEMPLATES_DIR);
      let count = 0;
      for (const item of items) {
        if (extname(item) === ".xml") {
          const name = item.replace(".xml", "");
          const content = await readFile(join(TEMPLATES_DIR, item), "utf-8");
          const meta = TEMPLATE_DESCRIPTIONS[name] || {
            description: "XSP template",
            category: "general",
          };
          await storage.createTemplate({
            name,
            description: meta.description,
            content,
            category: meta.category,
            is_builtin: true,
            created_at: now,
            updated_at: now,
          });
          count++;
        }
      }
      console.log(`Seeded ${count} built-in templates`);
    } catch {
      console.warn("Could not read templates directory for seeding");
    }
  }
}
