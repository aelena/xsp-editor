# XSP Prompt Crafter — Production Specification

## Overview

**XSP Prompt Crafter** is a web application that helps authors build, manage, validate, version, and test XML-Structured Prompts following the XSP methodology and VCO framework (Vocabulary, Constraints, Output Contracts). It targets teams at Phase 1–3 of the XSP adoption model: teams that have proven the pattern works and now need tooling to scale it.

The application consists of three layers:
1. **React frontend** — a clean, focused UI for authoring, validating, and testing prompts
2. **REST API** — endpoints for prompts, tags, constraints, verification, and LLM integration
3. **Cloud storage** — Azure Blob Storage + Table Storage (or S3 + DynamoDB on AWS)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  React Frontend                      │
│  ┌───────────┐ ┌──────────┐ ┌─────────────────────┐│
│  │  Prompt    │ │ Tag &    │ │  LLM Playground     ││
│  │  Editor    │ │ Constraint│ │  (BYOK)            ││
│  │           │ │ Registry  │ │                     ││
│  └───────────┘ └──────────┘ └─────────────────────┘│
└──────────────────────┬──────────────────────────────┘
                       │ REST API calls
┌──────────────────────▼──────────────────────────────┐
│                   API Server                         │
│            (Node.js + Express or Fastify)            │
│                                                      │
│  /prompts  /tags  /constraints  /verify  /llm        │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐│
│  │ Verification │  │ Template     │  │ LLM Proxy  ││
│  │ Engine       │  │ Renderer     │  │ (BYOK)     ││
│  └──────────────┘  └──────────────┘  └────────────┘│
└──────────┬───────────────────┬──────────────────────┘
           │                   │
┌──────────▼─────┐   ┌────────▼────────┐
│  Blob Storage  │   │  Table Storage  │
│  (prompt XML   │   │  (tags,         │
│   versions)    │   │   constraints,  │
│                │   │   config, logs) │
└────────────────┘   └─────────────────┘
```

---

## Frontend (React)

### Tech Stack

- **React 18+** with TypeScript
- **Vite** for build tooling
- **TailwindCSS** for styling — clean, minimal aesthetic
- **CodeMirror 6** for the XML editor with syntax highlighting
- **React Router** for navigation
- **TanStack Query** (React Query) for server state management
- **Zustand** for lightweight client state (editor state, UI preferences)

### Pages & Components

#### 1. Prompt Editor (`/prompts/:id/edit` and `/prompts/new`)

The core authoring experience. Split into three vertical panels:

| Panel | Purpose |
|-------|---------|
| **Left: Template Picker** | Sidebar listing available templates (Baseline, Longform, domain-specific). Click to scaffold a new prompt from a template. Also shows the tag registry and constraint library as draggable/insertable blocks. |
| **Center: XML Editor** | CodeMirror instance with XSP-aware features: tag autocomplete from the approved vocabulary, bracket matching, CDATA snippet insertion, `$variable` highlighting. Inline lint markers for structural issues. |
| **Right: Preview & Verify** | Live-rendered preview of the prompt. Below it, a verification panel showing pass/fail results for each structural check. A "Render" button to preview with sample variables. A "Test with LLM" button to send to the configured model. |

**Editor features:**
- Tag autocomplete pulls from the `/tags` API — only approved tags are suggested
- Insert constraint blocks from the library with a click (fetched from `/constraints`)
- `$variable` placeholders are highlighted distinctly; hovering shows if they are documented
- Real-time structural linting (runs the verification engine client-side for instant feedback, with server-side verification on save)
- Keyboard shortcut to wrap selected text in a tag (e.g., Ctrl+Shift+C wraps in `<constraint>`)
- CDATA insertion shortcut for `<![CDATA[...]]>` blocks

#### 2. Prompt List (`/prompts`)

Dashboard showing all prompts with:
- Name, current version (SemVer badge), last modified date, author
- Status indicators: verified (green), warnings (yellow), errors (red)
- Search and filter by tag usage, constraint IDs, author
- Quick actions: duplicate, view changelog, open in editor

#### 3. Tag Registry (`/tags`)

Table view of the approved tag vocabulary:
- Tag name, purpose, usage guidance, example
- Add/edit/deprecate tags
- Usage count (how many prompts use each tag)
- Enforcement toggle: "warn" vs "block" for unapproved tags

Mirrors the Tag Vocabulary Registry table from the book.

#### 4. Constraint Library (`/constraints`)

Reusable constraint management:
- Constraint ID (e.g., `MED-001`), description, severity (critical/high/medium/low), owner, status
- Full text of the constraint XML block
- Usage count (which prompts reference this constraint)
- Add/edit/deprecate/retire constraints
- Group by category (content, safety, style, structural, evidence, output)

Mirrors the Constraint Registry from the book's governance section.

#### 5. LLM Configuration (`/settings/llm`)

BYOK setup page:
- Provider selector: Anthropic, OpenAI, Azure OpenAI, Custom (OpenAI-compatible)
- API key input (masked after entry)
- Model selector (populated per provider: claude-sonnet-4-20250514, gpt-4o, etc.)
- Test connection button
- Default parameters: max_tokens, temperature

#### 6. Prompt Playground (`/prompts/:id/test`)

Interactive testing interface:
- Variable input form (auto-generated from `$variables` found in the template)
- Rendered prompt preview (template + variables merged)
- "Send to LLM" button
- Response display with:
  - Raw output
  - Token count (input/output)
  - Output contract validation results (if the prompt has an `<output_format>` requesting JSON, attempt to parse and validate)
  - Latency

#### 7. Version History (`/prompts/:id/versions`)

- List of all versions with SemVer, date, author, summary
- Side-by-side diff view (section-aware: highlights which XSP section changed)
- Rollback button (creates a new version from a previous one)
- Changelog display

---

## API

### Base URL: `/api/v1`

### Authentication

Simple API key or session-based auth. For v1, a single-user or small-team setup is fine — no complex RBAC. Auth token passed via `Authorization: Bearer <token>` header.

### Endpoints

#### Prompts

```
GET    /prompts                    List all prompts (paginated, filterable)
POST   /prompts                    Create a new prompt
GET    /prompts/:id                Get prompt (latest version)
PUT    /prompts/:id                Update prompt (creates new version)
DELETE /prompts/:id                Soft-delete prompt

GET    /prompts/:id/versions       List all versions
GET    /prompts/:id/versions/:ver  Get specific version
POST   /prompts/:id/rollback       Rollback to a specified version

GET    /prompts/:id/changelog      Get structured changelog
```

**Prompt object:**

```json
{
  "id": "uuid",
  "name": "classify-intent",
  "description": "Classifies customer messages into support categories",
  "version": "2.3.1",
  "content": "<task>...</task>\n<constraints>...</constraints>...",
  "variables": ["customer_message", "categories"],
  "tags_used": ["task", "constraints", "input", "output_format"],
  "constraints_referenced": ["GEN-001"],
  "author": "alice",
  "created_at": "2026-01-15T10:00:00Z",
  "updated_at": "2026-03-01T14:30:00Z",
  "verification_status": "passed",
  "metadata": {
    "domain": "customer-support",
    "phase": "production"
  }
}
```

**Create/Update request body:**

```json
{
  "name": "classify-intent",
  "description": "...",
  "content": "<task>...</task>...",
  "version_bump": "patch",
  "changelog_summary": "Fixed edge case in refund detection",
  "variables": {
    "customer_message": { "description": "The raw customer message", "required": true },
    "categories": { "description": "Comma-separated allowed categories", "required": true }
  }
}
```

The `version_bump` field (`major`, `minor`, `patch`) drives SemVer increments. If omitted, defaults to `patch`.

#### Tags

```
GET    /tags                       List all approved tags
POST   /tags                       Add a new approved tag
PUT    /tags/:name                 Update tag definition
DELETE /tags/:name                 Deprecate/remove tag
```

**Tag object:**

```json
{
  "name": "task",
  "purpose": "Primary instruction — what the model should do",
  "use_when": "Every prompt",
  "example": "<task>Summarize the document for executives</task>",
  "enforcement": "required",
  "usage_count": 47,
  "created_at": "2026-01-01T00:00:00Z"
}
```

`enforcement` can be:
- `required` — every prompt must include this tag
- `recommended` — linter warns if missing
- `optional` — no warning
- `deprecated` — linter warns if present

#### Constraints

```
GET    /constraints                List all constraints (filterable by severity, category, status)
POST   /constraints                Create a new reusable constraint
GET    /constraints/:id            Get constraint by ID
PUT    /constraints/:id            Update constraint
DELETE /constraints/:id            Retire constraint
```

**Constraint object:**

```json
{
  "id": "MED-001",
  "description": "No medical diagnoses or treatment recommendations",
  "severity": "critical",
  "category": "safety",
  "owner": "compliance-team",
  "status": "active",
  "xml_block": "<constraint id=\"MED-001\" severity=\"critical\">\n  Never provide medical diagnoses or treatment recommendations.\n  If asked, respond: \"Please consult a licensed healthcare provider.\"\n</constraint>",
  "usage_count": 12,
  "created_at": "2026-01-10T00:00:00Z",
  "updated_at": "2026-02-15T00:00:00Z"
}
```

#### Verification

```
POST   /verify                     Validate a prompt against all rules
```

**Request:**

```json
{
  "content": "<task>...</task>...",
  "variables": { "customer_message": { "description": "..." } }
}
```

**Response:**

```json
{
  "status": "warnings",
  "score": 82,
  "checks": [
    {
      "rule": "approved_tags",
      "status": "passed",
      "message": "All tags are in the approved registry"
    },
    {
      "rule": "required_tags",
      "status": "passed",
      "message": "Required tag <task> is present"
    },
    {
      "rule": "empty_sections",
      "status": "warning",
      "message": "Section <examples> is empty — remove it or add content",
      "anti_pattern": "Empty Section Accumulation"
    },
    {
      "rule": "nesting_depth",
      "status": "passed",
      "message": "Maximum nesting depth is 2 (limit: 3)"
    },
    {
      "rule": "variable_docs",
      "status": "failed",
      "message": "Variable $order_id is used but not documented"
    },
    {
      "rule": "constraint_conflicts",
      "status": "passed",
      "message": "No obvious constraint conflicts detected"
    }
  ],
  "anti_pattern_scan": [
    {
      "pattern": "Tag Sprawl",
      "detected": false
    },
    {
      "pattern": "Over-Specification",
      "detected": false
    },
    {
      "pattern": "Empty Section Accumulation",
      "detected": true,
      "details": "<examples> section is empty"
    }
  ]
}
```

#### Verification Rules (detailed)

The verification engine implements these checks, derived from the book's anti-patterns and best practices:

| Rule | What it checks | Severity |
|------|---------------|----------|
| `approved_tags` | All tags in the prompt exist in the tag registry | error if `enforcement=required`, warning otherwise |
| `required_tags` | Tags marked `enforcement=required` (e.g., `<task>`) are present | error |
| `empty_sections` | No tags with only whitespace or comments inside | warning |
| `nesting_depth` | No nesting deeper than 3 levels | warning |
| `variable_docs` | Every `$variable` in the template has a documented description | error |
| `cdata_for_input` | `<input>` and `<untrusted_input>` tags use CDATA wrappers | warning |
| `constraint_count` | Fewer than 15 constraints (heuristic for over-specification) | warning if >15 |
| `tag_count` | Fewer than 12 unique tag types (heuristic for tag sprawl) | warning if >12 |
| `constraint_conflicts` | Basic heuristic: flag pairs like "be comprehensive" + "max 100 words" | warning |
| `output_format_present` | An `<output_format>` or `<output_contract>` tag exists | warning |
| `pseudo_programming` | Flag `<if>`, `<else>`, `<for-each>`, `<when>`, `<set>` tags | error |
| `redundant_nesting` | Flag patterns like `<config><task_config><primary_task>` | warning |

#### Render

```
POST   /render                     Render a template with variables
```

**Request:**

```json
{
  "prompt_id": "classify-intent",
  "version": "2.3.1",
  "variables": {
    "customer_message": "I want to cancel my subscription",
    "categories": "billing, cancellation, technical_support"
  }
}
```

Or pass raw content instead of prompt_id:

```json
{
  "content": "<task>Classify: $customer_message</task>...",
  "variables": {
    "customer_message": "I want to cancel"
  }
}
```

**Response:**

```json
{
  "rendered": "<task>Classify: I want to cancel</task>...",
  "token_estimate": 187,
  "unresolved_variables": []
}
```

#### LLM Test

```
POST   /llm/test                   Send a rendered prompt to the configured LLM
GET    /llm/config                 Get current LLM configuration (key masked)
PUT    /llm/config                 Update LLM configuration
POST   /llm/test-connection        Verify the API key works
```

**Test request:**

```json
{
  "prompt_id": "classify-intent",
  "variables": {
    "customer_message": "I need a refund for order #12345",
    "categories": "billing, cancellation, technical_support, refund"
  },
  "model_override": null,
  "max_tokens": 256,
  "temperature": 0
}
```

**Test response:**

```json
{
  "response": "{\"category\": \"refund\", \"confidence\": \"high\"}",
  "model": "claude-sonnet-4-20250514",
  "tokens": {
    "input": 203,
    "output": 24,
    "total": 227
  },
  "latency_ms": 1240,
  "output_validation": {
    "is_valid_json": true,
    "parsed": { "category": "refund", "confidence": "high" }
  }
}
```

**LLM config object:**

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "api_key_set": true,
  "default_max_tokens": 1024,
  "default_temperature": 0,
  "custom_base_url": null
}
```

The API key itself is never returned — only a boolean indicating whether one is set. The key is stored encrypted in Table Storage.

---

## Storage Design

### Option A: Azure Storage Account (Recommended)

A single Azure Storage Account provides both Blob and Table storage.

#### Blob Storage — Prompt Versions

**Container:** `prompt-versions`

**Blob naming:** `{prompt_id}/{version}.xml`

Example:
```
prompt-versions/
  classify-intent/
    1.0.0.xml
    1.1.0.xml
    2.0.0.xml
    2.3.0.xml
    2.3.1.xml
  extract-entities/
    1.0.0.xml
    1.0.1.xml
```

Each blob stores the raw XML template content. Blob metadata stores:
- `version`: SemVer string
- `author`: who created this version
- `changelog_summary`: one-line summary
- `created_at`: ISO timestamp
- `version_bump_type`: major/minor/patch

Blobs are immutable — a new version creates a new blob, never overwrites. This gives you a complete, append-only version history.

#### Table Storage — Structured Data

**Table: `Prompts`** (latest state of each prompt)

| PartitionKey | RowKey | Name | Description | CurrentVersion | Author | VerificationStatus | CreatedAt | UpdatedAt | Variables (JSON) | Metadata (JSON) |
|---|---|---|---|---|---|---|---|---|---|---|
| `prompts` | `{prompt_id}` | classify-intent | ... | 2.3.1 | alice | passed | ... | ... | `{...}` | `{...}` |

**Table: `Tags`** (approved tag vocabulary)

| PartitionKey | RowKey | Purpose | UseWhen | Example | Enforcement | UsageCount | CreatedAt |
|---|---|---|---|---|---|---|---|
| `tags` | `task` | Primary instruction | Every prompt | ... | required | 47 | ... |
| `tags` | `constraints` | Behavioral guardrails | ... | ... | recommended | 42 | ... |

**Table: `Constraints`** (reusable constraint library)

| PartitionKey | RowKey | Description | Severity | Category | Owner | Status | XmlBlock | UsageCount | CreatedAt | UpdatedAt |
|---|---|---|---|---|---|---|---|---|---|---|
| `constraints` | `MED-001` | No medical diagnoses | critical | safety | compliance | active | `<constraint...>` | 12 | ... | ... |

**Table: `Changelogs`** (version change history)

| PartitionKey | RowKey | Version | Summary | ChangeType | AffectedSections (JSON) | MigrationNotes | Author | CreatedAt |
|---|---|---|---|---|---|---|---|---|
| `{prompt_id}` | `{version}` | 2.3.1 | Fixed edge case... | patch | `["examples"]` | null | alice | ... |

**Table: `Config`** (application configuration including LLM settings)

| PartitionKey | RowKey | Provider | Model | EncryptedApiKey | DefaultMaxTokens | DefaultTemperature | CustomBaseUrl |
|---|---|---|---|---|---|---|---|
| `config` | `llm` | anthropic | claude-sonnet-4-20250514 | `{encrypted}` | 1024 | 0 | null |

### Option B: AWS (S3 + DynamoDB)

If deploying on AWS instead of Azure:

| Azure | AWS Equivalent | Notes |
|-------|---------------|-------|
| Blob Storage | S3 | Same blob-per-version pattern. Use S3 versioning or explicit key naming. |
| Table Storage | DynamoDB | Same table structure. PartitionKey maps to DynamoDB's partition key. |

The API layer abstracts the storage provider — a `StorageAdapter` interface with `AzureStorageAdapter` and `AwsStorageAdapter` implementations. Switching providers requires changing one config value, not rewriting the app.

---

## API Server

### Tech Stack

- **Node.js 20+** with TypeScript
- **Fastify** — lightweight, fast, schema-based validation built in
- **@azure/data-tables** and **@azure/storage-blob** for Azure storage (or `@aws-sdk/client-s3` + `@aws-sdk/client-dynamodb` for AWS)
- **zod** for request/response validation
- **tiktoken** (or equivalent) for token estimation

### Project Structure

```
server/
├── src/
│   ├── index.ts                  # Fastify app setup, route registration
│   ├── routes/
│   │   ├── prompts.ts            # /prompts CRUD + versioning
│   │   ├── tags.ts               # /tags CRUD
│   │   ├── constraints.ts        # /constraints CRUD
│   │   ├── verify.ts             # /verify endpoint
│   │   ├── render.ts             # /render endpoint
│   │   └── llm.ts                # /llm/test, /llm/config
│   ├── services/
│   │   ├── verification.ts       # Verification engine (all rules)
│   │   ├── renderer.ts           # Template variable substitution
│   │   ├── llm-proxy.ts          # BYOK LLM call proxy
│   │   └── versioning.ts         # SemVer logic, changelog generation
│   ├── storage/
│   │   ├── adapter.ts            # StorageAdapter interface
│   │   ├── azure.ts              # Azure Blob + Table implementation
│   │   └── aws.ts                # S3 + DynamoDB implementation
│   ├── schemas/                  # Zod schemas for all request/response types
│   └── config.ts                 # Environment config
├── package.json
└── tsconfig.json
```

### Key Implementation Details

#### Verification Engine (`services/verification.ts`)

The verification engine runs all structural checks against a prompt string. It returns a structured report (as shown in the `/verify` response above).

Rules are implemented as independent functions:

```typescript
interface VerificationRule {
  id: string;
  name: string;
  check(content: string, context: VerificationContext): CheckResult;
}

interface VerificationContext {
  approvedTags: Set<string>;
  requiredTags: Set<string>;
  documentedVariables: Record<string, VariableDoc>;
}

interface CheckResult {
  status: "passed" | "warning" | "failed";
  message: string;
  antiPattern?: string;
  details?: string;
}
```

Each rule is a pure function — easy to test, easy to add new ones. The engine runs all rules and aggregates results.

#### Template Renderer (`services/renderer.ts`)

Uses `$variable` substitution (matching the book's convention). The renderer:
1. Parses the template for `$variable` placeholders
2. Substitutes provided values
3. Reports any unresolved variables
4. Estimates token count using tiktoken

It also supports stripping empty optional sections (the book recommends this for production to save tokens).

#### LLM Proxy (`services/llm-proxy.ts`)

A thin proxy that:
1. Reads the encrypted API key from storage, decrypts it
2. Builds the appropriate request for the configured provider (Anthropic SDK, OpenAI SDK, or raw HTTP for custom endpoints)
3. Sends the rendered prompt
4. Returns the response with token counts and latency
5. Attempts basic output validation (JSON parsing if the prompt requests JSON output)

Provider abstraction:

```typescript
interface LLMProvider {
  send(prompt: string, options: LLMOptions): Promise<LLMResponse>;
  testConnection(): Promise<boolean>;
  listModels(): Promise<string[]>;
}
```

Implementations: `AnthropicProvider`, `OpenAIProvider`, `AzureOpenAIProvider`, `CustomProvider`.

---

## Frontend Project Structure

```
client/
├── src/
│   ├── main.tsx
│   ├── App.tsx                    # Router setup
│   ├── pages/
│   │   ├── PromptList.tsx         # Dashboard of all prompts
│   │   ├── PromptEditor.tsx       # Three-panel editor
│   │   ├── PromptPlayground.tsx   # Variable input + LLM testing
│   │   ├── PromptVersions.tsx     # Version history + diffs
│   │   ├── TagRegistry.tsx        # Tag vocabulary management
│   │   ├── ConstraintLibrary.tsx  # Constraint CRUD
│   │   └── Settings.tsx           # LLM configuration
│   ├── components/
│   │   ├── XmlEditor.tsx          # CodeMirror wrapper with XSP extensions
│   │   ├── PromptPreview.tsx      # Rendered prompt preview
│   │   ├── VerificationPanel.tsx  # Check results display
│   │   ├── TagAutocomplete.tsx    # Tag suggestion dropdown
│   │   ├── ConstraintPicker.tsx   # Insert constraint from library
│   │   ├── VersionDiff.tsx        # Side-by-side diff viewer
│   │   ├── TokenCounter.tsx       # Live token estimate display
│   │   └── TemplateGallery.tsx    # Starter template selector
│   ├── api/
│   │   ├── client.ts              # Fetch wrapper
│   │   ├── prompts.ts             # Prompt API hooks (TanStack Query)
│   │   ├── tags.ts                # Tag API hooks
│   │   ├── constraints.ts         # Constraint API hooks
│   │   ├── verify.ts              # Verification API hook
│   │   └── llm.ts                 # LLM config + test hooks
│   ├── store/
│   │   └── editor.ts              # Zustand store for editor state
│   ├── templates/                 # Built-in starter templates
│   │   ├── baseline.xml
│   │   ├── longform.xml
│   │   ├── extraction.xml
│   │   ├── summarization.xml
│   │   └── customer-support.xml
│   └── styles/
│       └── globals.css            # Tailwind base + custom styles
├── index.html
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vite.config.ts
```

### Built-in Templates

Shipped with the app, derived directly from the book:

1. **Baseline** — The book's baseline template: `<task>`, `<context>`, `<constraints>`, `<input>`, `<output_format>`, optional `<examples>` and `<checks>`
2. **Longform** — The book's deep long-form content template with VCO sections: `<topic>`, `<audience>`, `<intent>`, `<stance>`, `<voice_and_tone>`, `<source_policy>`, `<constraints>`, `<output_contract>`
3. **Extraction** — For structured data extraction: `<task>`, `<fields>`, `<input>`, `<output_format>` with JSON schema
4. **Summarization** — Constrained summarization: `<task>`, `<audience>`, `<constraints>`, `<input>`, `<output_format>`
5. **Customer Support** — With injection defense layers: `<system_instructions>`, `<task>`, `<constraints>`, `<untrusted_input>`, `<output_format>`

### Default Tag Registry

Pre-populated with the book's recommended vocabulary:

| Tag | Enforcement | Purpose |
|-----|-------------|---------|
| `task` | required | Primary instruction |
| `context` | optional | Background information |
| `constraints` | recommended | Behavioral guardrails container |
| `constraint` | optional | Individual guardrail |
| `input` | recommended | User-provided or variable data |
| `output_format` | recommended | Expected response shape |
| `output_contract` | optional | Detailed output specification (alternative to output_format) |
| `examples` | optional | Few-shot demonstrations container |
| `example` | optional | Individual demonstration |
| `audience` | optional | Target reader |
| `checks` | optional | Self-verification steps |
| `pii_policy` | optional | PII handling rules |
| `untrusted_input` | optional | Explicitly marked untrusted content |

### Default Constraint Library

Pre-populated with common reusable constraints:

| ID | Description | Severity | Category |
|----|-------------|----------|----------|
| `GEN-001` | No fabricated information — only what is in the provided input | critical | content |
| `GEN-002` | If information is unavailable, say so — do not guess | high | content |
| `GEN-003` | No preamble or meta-commentary in output | medium | output |
| `PII-001` | Never include names, emails, phone numbers, or other PII in output | critical | safety |
| `PII-002` | If referencing a person, use generic terms: "the customer", "the user" | high | safety |
| `MED-001` | Never provide medical diagnoses or treatment recommendations | critical | safety |
| `LEGAL-001` | Never provide legal advice or conclusions | critical | safety |
| `TONE-001` | Use restrained professional tone — no marketing superlatives | medium | style |
| `FORMAT-001` | Output must be valid JSON — no markdown fences, no extra text | high | output |
| `FORMAT-002` | Use null for unknown fields, empty array for no results | medium | output |

---

## Deployment

### Development

```bash
# Terminal 1: API server
cd server
npm install
npm run dev          # Fastify with hot reload on port 3001

# Terminal 2: Frontend
cd client
npm install
npm run dev          # Vite dev server on port 5173, proxied to API
```

### Environment Variables

```env
# Storage
STORAGE_PROVIDER=azure                    # "azure" or "aws"
AZURE_STORAGE_CONNECTION_STRING=...       # For Azure
AWS_REGION=us-east-1                      # For AWS
AWS_ACCESS_KEY_ID=...                     # For AWS
AWS_SECRET_ACCESS_KEY=...                 # For AWS

# Encryption
ENCRYPTION_KEY=...                        # For encrypting stored API keys (32-byte hex)

# Server
PORT=3001
NODE_ENV=production
API_AUTH_TOKEN=...                        # Simple bearer token for API auth

# Frontend (build-time)
VITE_API_BASE_URL=/api/v1
```

### Production Deployment

**Containerized (recommended):**

```dockerfile
# Single container: API serves both the API and the built React static files
FROM node:20-alpine AS build-client
WORKDIR /app/client
COPY client/ .
RUN npm ci && npm run build

FROM node:20-alpine
WORKDIR /app
COPY server/ .
RUN npm ci --production
COPY --from=build-client /app/client/dist ./public
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

The Fastify server serves the React build from `/public` as static files and the API from `/api/v1`. Single container, single port — deploy to Azure Container Apps, AWS App Runner, or any container host.

**Azure-specific:**
- Azure Container Apps for the server
- Azure Storage Account for blobs + tables
- Managed Identity for storage access (no connection string needed in production)

**AWS-specific:**
- AWS App Runner or ECS Fargate
- S3 bucket + DynamoDB table
- IAM role for storage access

---

## Implementation Phases

### Phase 1: Core CRUD + Editor (MVP)

**Goal:** Authors can create, edit, version, and verify XSP prompts.

- [ ] API: `/prompts` CRUD with Blob Storage versioning
- [ ] API: `/tags` CRUD with Table Storage
- [ ] API: `/constraints` CRUD with Table Storage
- [ ] API: `/verify` with core rules (approved_tags, required_tags, empty_sections, nesting_depth, variable_docs)
- [ ] Frontend: Prompt list page
- [ ] Frontend: Prompt editor with CodeMirror, tag autocomplete, live verification
- [ ] Frontend: Tag registry page
- [ ] Frontend: Constraint library page
- [ ] Built-in templates (baseline, longform, extraction, summarization, customer-support)
- [ ] Default tag registry and constraint library seeded on first run

### Phase 2: LLM Integration + Playground

**Goal:** Authors can test prompts against real models.

- [ ] API: `/llm/config` for BYOK setup
- [ ] API: `/llm/test` for sending prompts to configured model
- [ ] API: `/render` for template rendering with variables
- [ ] Frontend: LLM settings page
- [ ] Frontend: Prompt playground with variable inputs, send-to-LLM, response display
- [ ] Token estimation in editor and playground

### Phase 3: Versioning & Diffs

**Goal:** Full version history with meaningful diffs.

- [ ] API: `/prompts/:id/versions` and `/prompts/:id/changelog`
- [ ] API: `/prompts/:id/rollback`
- [ ] Frontend: Version history page with section-aware diffs
- [ ] Frontend: Changelog display
- [ ] Frontend: Rollback UI

### Phase 4: Advanced Verification

**Goal:** Deeper anti-pattern detection and constraint conflict analysis.

- [ ] Verification: constraint conflict heuristics
- [ ] Verification: pseudo-programming detection
- [ ] Verification: redundant nesting detection
- [ ] Verification: example overload detection
- [ ] Verification: over-specification scoring
- [ ] Anti-pattern summary score in editor sidebar

---

## Non-Goals (v1)

These are explicitly out of scope for the initial version:

- **Multi-user collaboration / RBAC** — v1 is single-user or small-team. Add auth later.
- **Prompt execution logging / observability** — The tool is for authoring and testing, not production monitoring. Observability belongs in the deployment pipeline.
- **A/B testing infrastructure** — Described in the book's governance section but belongs in production infrastructure, not an authoring tool.
- **Automatic rollback triggers** — Same reasoning. The tool supports manual rollback; automated triggers belong in the deployment layer.
- **CI/CD integration** — Future: export prompts to a Git repo, integrate with CI linting pipelines. Not v1.
- **Multi-tenant / org-wide deployment** — v1 is a single instance. Multi-tenant is a future evolution.

---

## Design Principles

1. **The book is the spec.** Every feature maps to a concept from the XSP book: VCO framework, tag governance, constraint registries, anti-pattern detection, SemVer versioning, template rendering. The tool makes the book's ideas concrete and usable.

2. **Structure is a first-class citizen.** Tags, constraints, and output contracts are not just text inside prompts — they are managed entities with their own CRUD, their own registries, and their own validation rules.

3. **Verify before you ship.** The verification engine is not optional. Every save runs structural checks. The editor shows lint results in real-time. The goal is to catch anti-patterns and structural issues before a prompt ever reaches a model.

4. **BYOK, not SaaS.** The tool never touches the user's LLM traffic except when they explicitly click "Test." No telemetry, no cloud dependency for the core authoring flow. Storage is the user's own Azure or AWS account.

5. **Start simple, add complexity only when needed.** The baseline template has 7 tags. The constraint library has 10 entries. The verification engine has 12 rules. This is intentionally minimal — matching the book's own advice against over-specification and premature formalization.
