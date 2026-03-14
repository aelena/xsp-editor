# XSP Editor — User Manual

## Getting Started

**What is XSP?**

XML-Structured Prompting (XSP) is a methodology for writing LLM prompts using XML tags to wrap each logical part of the prompt. Instead of writing a prompt as a single block of text, you give every section a clear, machine-readable label — `<task>`, `<context>`, `<constraints>`, and so on. This improves clarity for both you and the model, reduces ambiguity, and makes prompts easier to audit, version, and reuse.

**The VCO Framework**

XSP organises prompts around three pillars:

- **Vocabulary** — A controlled set of approved XML tags, each with a defined purpose. Only tags from the Tag Registry are valid in a prompt.
- **Constraints** — Reusable behavioral guardrails that tell the model what it must, should, or must not do (e.g., "no fabricated information", "respond in plain English only").
- **Output contracts** — Explicit definitions of the expected response shape, format, and structure. These replace vague instructions like "respond in JSON" with a precise contract the model can follow reliably.

**First Launch**

When you open the application you will see a welcome screen with a brief introduction to XSP. Click **Get Started** to go to the Prompts dashboard, which is your main workspace.

---

## Prompts Dashboard (`/prompts`)

The Prompts dashboard lists every prompt you have created. For each prompt you can see:

- **Name** — The human-readable title of the prompt.
- **Version** — A SemVer string (e.g., `1.0.0`, `2.1.3`) that increments as you make changes.
- **Verification status** — Whether the prompt currently passes all structural checks (pass, warn, or fail).
- **Author** — Who created or last edited the prompt.
- **Last modified** — Timestamp of the most recent change.

**Searching and filtering**

Use the search bar to filter prompts by name. You can also narrow results by author or by tag using the filter controls.

**Quick actions**

Each prompt row has three quick actions:

- **Edit** — Opens the Prompt Editor for that prompt.
- **Duplicate** — Creates a copy of the prompt with a new name so you can build on an existing structure.
- **Changelog** — Shows the version history and change notes for the prompt.

**Creating a new prompt**

Navigate to `/prompts/new` or click the **New Prompt** button on the dashboard.

---

## Prompt Editor (`/prompts/new`, `/prompts/:id/edit`)

The Prompt Editor is the core of the application. It is divided into three areas:

**XML Editor (center)**

A full-featured CodeMirror editor with XML syntax highlighting. This is where you write and modify your prompt structure. Key features:

- **Tag autocomplete** — Type `<` anywhere in the editor to see a suggestion list drawn from the approved Tag Registry. Select a suggestion with Tab or Enter to insert the opening and closing tags.
- **$variable highlighting** — Placeholders like `$user_input` or `$topic` are highlighted in a distinct colour so they stand out from static content. These are the values you will fill in at runtime via the Playground.
- **CDATA insertion** — Use the toolbar or shortcut to wrap content in a `<![CDATA[...]]>` block. This is required for `<input>` and `<untrusted_input>` tags to prevent prompt injection.

**Constraint Picker (sidebar)**

The left sidebar lets you browse the Constraint Library and insert constraints directly into the editor. Click any constraint to append it at the cursor position as a properly formatted `<constraint>` element with the correct `id` and `severity` attributes.

**Verification Panel (right)**

As you type, the editor continuously checks your prompt against the full set of structural rules. The Verification Panel shows each rule, whether it passed, produced a warning, or failed, and a brief explanation of any issue. Warnings do not block saving; failures indicate problems that should be resolved before the prompt is used in production.

**Prompt Preview**

Below the editor, the Prompt Preview renders the current XML as formatted output so you can see what the model will receive. This view strips editor chrome and shows the clean, rendered prompt.

---

## Tag Registry (`/tags`)

The Tag Registry is the Vocabulary pillar of VCO. It defines every XML tag that is approved for use in prompts.

Each tag entry includes:

- **Name** — The tag name as it appears in XML (e.g., `task`, `context`).
- **Purpose** — A short description of what this section conveys to the model.
- **Usage guidance** — When and how to use the tag.
- **Examples** — Illustrative XML snippets.
- **Enforcement level** — One of:
  - `required` — Must appear in every valid prompt. The verifier will fail any prompt missing this tag.
  - `recommended` — The verifier will warn if this tag is absent, but will not fail the prompt.
  - `optional` — Use when appropriate; no warning either way.
  - `deprecated` — The verifier will warn if this tag is present, as it should no longer be used.

**Default tags**

The application is seeded with 13 default tags derived from the XSP book:

`task`, `context`, `constraints`, `constraint`, `input`, `output_format`, `output_contract`, `examples`, `example`, `audience`, `checks`, `pii_policy`, `untrusted_input`

**Managing tags**

You can add new tags to extend the vocabulary for your organisation, edit existing tags to update their guidance, or remove tags that are no longer relevant. Changes to the registry take effect immediately in the editor's autocomplete and verification rules.

---

## Constraint Library (`/constraints`)

The Constraint Library is the Constraints pillar of VCO. Constraints are reusable behavioral guardrails that you insert into prompts to shape how the model responds.

Each constraint has:

- **ID** — A unique identifier in the format `CATEGORY-NNN` (e.g., `GEN-001`, `SAFETY-002`). Reference this ID in your `<constraint>` tags to make prompts auditable.
- **Description** — A plain-language statement of the rule.
- **Severity** — How serious a violation would be:
  - `critical` — Must never be violated.
  - `high` — Should not be violated without explicit justification.
  - `medium` — Strong preference; deviation should be noted.
  - `low` — A soft guideline.
- **Category** — `content`, `safety`, `style`, or `output`.

**Default constraints**

Ten default constraints are seeded from the XSP book, covering common needs like factual accuracy, PII handling, tone, and output format compliance.

**Managing constraints**

You can add new constraints, edit existing ones, or retire constraints that are no longer relevant. Retired constraints remain visible in the library with a retired status so that existing prompts referencing their IDs are not broken.

**Inserting into prompts**

From the Constraint Picker in the Prompt Editor, click any constraint to insert it at the cursor. You can also type `<constraint` in the editor and fill in the `id` and `severity` attributes manually.

---

## Templates (`/templates`)

Templates give you a ready-made XML structure to start from rather than writing from scratch.

**Built-in templates**

Five starter templates are derived directly from the XSP book:

- **Baseline** — A standard general-purpose prompt containing `<task>`, `<context>`, `<constraints>`, `<input>`, `<output_format>`, `<examples>`, and `<checks>`. The right starting point for most prompts.
- **Longform** — For generating deep, structured content. Includes VCO framework sections: `<topic>`, `<audience>`, `<intent>`, `<stance>`, `<voice_and_tone>`, `<source_policy>`, and `<output_contract>`.
- **Extraction** — For pulling structured data out of unstructured text. Includes field definitions and a JSON output contract.
- **Summarization** — For constrained summarisation tasks with explicit audience targeting and length bounds.
- **Customer Support** — Includes injection defense layers using `<system_instructions>` and `<untrusted_input>`, plus PII-handling constraints. Use this as a base for any prompt that accepts untrusted user input.

**Custom templates**

Any prompt you have created can be saved as a template. From the Prompt Editor, use the **Save as Template** option. Your custom template will then appear in the Templates gallery alongside the built-in ones.

---

## Playground (`/playground`)

The Playground lets you test a prompt against a real LLM before deploying it.

**How to use it:**

1. Enter your prompt content in the prompt field, or load a saved prompt.
2. For any `$variable` placeholders in the prompt, fill in the corresponding values in the variables panel.
3. Click **Send** to submit to your configured LLM provider.

The response panel shows the model's reply along with metadata: token counts (prompt tokens, completion tokens, total), and latency in milliseconds.

The Playground uses a BYOK (Bring Your Own Key) model — you supply your own API credentials in Settings. No requests are routed through any third-party service; calls go directly from the application server to the LLM provider.

---

## Settings (`/settings`)

Configure the LLM provider used by the Playground.

**Provider**

Choose from:

- **Anthropic** — Use Claude models via the Anthropic API.
- **OpenAI** — Use GPT models via the OpenAI API.
- **Azure OpenAI** — Use Azure-hosted OpenAI models with an Azure endpoint and deployment name.
- **OpenAI-compatible** — Any provider that implements the OpenAI API contract (e.g., local models via Ollama, Together AI, Groq).

**API Key**

Enter your API key for the selected provider. The key is stored in server memory only for the duration of the session. It is never written to disk and is never returned by any API response. If the server restarts, you will need to re-enter your key.

**Model and defaults**

Set the default model name, `max_tokens`, and `temperature` for Playground requests. These are starting defaults; you can adjust them per-run in the Playground.

**Test connection**

Click **Test Connection** to send a minimal request to the provider with your current credentials and confirm that the key is valid before running real prompts.

---

## Verification Rules

The Prompt Editor checks your prompt against 14 rules derived from the XSP book. Results are shown in real time in the Verification Panel.

| Rule | What it checks |
|------|----------------|
| `approved_tags` | All tags in the prompt exist in the Tag Registry |
| `required_tags` | All tags marked as `required` in the registry are present |
| `empty_sections` | No tags contain only whitespace |
| `nesting_depth` | Nesting does not exceed 3 levels |
| `variable_docs` | Every `$variable` placeholder has a documented description |
| `cdata_for_input` | `<input>` and `<untrusted_input>` tags use CDATA wrappers |
| `constraint_count` | Fewer than 15 constraints are present |
| `tag_count` | Fewer than 12 unique tag types are used |
| `output_format_present` | An `<output_format>` or `<output_contract>` tag is present |
| `pseudo_programming` | No `if`, `else`, `for-each`, or similar control-flow tags are used |
| `redundant_nesting` | No deeply nested wrapper patterns that add no meaning |
| `constraint_conflicts` | No contradictory constraint directives |
| `example_overload` | Fewer than 5 few-shot examples are provided |
| `over_specification` | Composite complexity score is within acceptable bounds |

Rules that produce failures should be resolved before a prompt is considered production-ready. Rules that produce warnings are advisory.

---

## XSP Quick Reference

### Basic Prompt Structure

```xml
<task>
  What the model should do
</task>

<context>
  Background information the model needs
</context>

<constraints>
  <constraint id="GEN-001" severity="critical">
    No fabricated information
  </constraint>
</constraints>

<input>
  <![CDATA[$user_input]]>
</input>

<output_format>
  Expected response shape
</output_format>
```

### Best Practices

- Always include a `<task>` tag — it is required by the verifier and by the model.
- Use CDATA wrappers for `<input>` and `<untrusted_input>` to prevent prompt injection.
- Keep nesting to 3 levels or fewer to maintain readability.
- Use `$variable` placeholders for all dynamic content rather than hardcoding values.
- Reference constraint IDs from the library (e.g., `id="GEN-001"`) for auditability and consistency.
- Keep the total number of constraints under 15 per prompt to avoid over-specification.
- Keep unique tag types under 12 to avoid tag sprawl.
- Add a `<checks>` section when the model should self-verify its answer before responding.
- Use `<output_contract>` instead of `<output_format>` when the output requirements are complex or must be validated programmatically.

### Anti-Patterns to Avoid

- **Empty sections** — Tags with no content add noise and trigger a verification failure.
- **Tag sprawl** — Using more than 12 unique tag types makes prompts hard to read and maintain.
- **Over-specification** — Too many constraints compete for the model's attention and reduce reliability.
- **Pseudo-programming** — Tags like `<if>`, `<else>`, or `<for-each>` imply the model is a runtime interpreter. It is not; use natural language conditions instead.
- **Redundant nesting** — Wrapping content in unnecessary layers (e.g., `<wrapper><container><content>`) adds depth without meaning.
- **Constraint conflicts** — Contradictory rules such as "be comprehensive" combined with "respond in under 100 words" produce unpredictable output.

---

## Keyboard Shortcuts

The XML editor is built on CodeMirror and supports standard editing shortcuts:

- **Ctrl+Z / Cmd+Z** — Undo
- **Ctrl+Shift+Z / Cmd+Shift+Z** — Redo
- **Ctrl+F / Cmd+F** — Find
- **Ctrl+H / Cmd+H** — Find and replace
- **Tab** — Accept the current autocomplete suggestion

---

## Storage

The application currently uses in-memory storage. All prompts, tags, and constraints are seeded fresh from the built-in defaults each time the server starts. Any changes you make during a session will be lost when the server restarts.

The server is built on a `StorageAdapter` interface designed to support pluggable persistent backends (such as Azure Table Storage or AWS DynamoDB) without changes to application logic. Persistent storage is a planned enhancement.

---

## Ports

| Service | Address |
|---------|---------|
| Frontend | `http://localhost:5998` |
| API server | `http://localhost:5999` |

The API server is proxied through the frontend at `/api`, so in normal use you only need to open `http://localhost:5998` in your browser.

---

For more information on the XSP methodology, see the XML-Structured Prompting book.
