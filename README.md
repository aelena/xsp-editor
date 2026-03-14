# XSP Editor

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![BYOK](https://img.shields.io/badge/LLM-Bring_Your_Own_Key-green)](#llm-integration)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com)

A web-based editor for authoring, validating, and testing XML-Structured Prompts (XSP).

XSP is a prompting methodology that wraps each part of an LLM prompt in labeled XML tags, creating unambiguous structure that improves reliability, maintainability, and auditability. This editor is a companion tool to my [XML-Structured Prompting book](https://aelena74.gumroad.com/l/xsp).

## What it does

- **Author** XSP prompts with a CodeMirror-based XML editor featuring syntax highlighting, tag autocomplete from an approved vocabulary, `$variable` highlighting, and `CDATA` insertion shortcuts
- **Validate** prompts in real-time against structural rules derived from the book: required tags, nesting depth, empty sections, constraint conflicts, pseudo-programming detection, and anti-pattern scoring
- **Manage** a tag vocabulary registry and reusable constraint library aligned with the __VCO framework__ (Vocabulary, Constraints, Output contracts). See the book for further details on that framework.
- **Test** prompts against real LLMs via _BYOK (Bring Your Own Key)_ integration with Anthropic, OpenAI, Azure OpenAI, or any OpenAI-compatible endpoint
- **Render** prompt templates with variable substitution and token estimation

## Quick start

```bash
# Terminal 1: API server
cd server
npm install
npm run dev          # Fastify on port 5999

# Terminal 2: Frontend
cd client
npm install
npm run dev          # Vite on port 5998, proxied to API
```

Open http://localhost:5998 in your browser.

On first run, the server seeds a default tag registry (13 tags from the book's recommended vocabulary) and constraint library (10 reusable constraints covering content, safety, style, and output categories).

## Architecture

```
client/          React + TypeScript + Tailwind + CodeMirror 6
  src/pages/     PromptEditor, PromptList, TagRegistry, ConstraintLibrary,
                 PromptPlayground, Templates, Settings
  src/api/       TanStack Query hooks for server state
  src/store/     Zustand stores for editor UI state

server/          Node.js + Fastify + TypeScript + Zod
  src/routes/    REST API endpoints (/prompts, /tags, /constraints, /verify, /render, /llm, /templates)
  src/services/  Verification engine, template renderer, LLM proxy, SemVer versioning
  src/storage/   StorageAdapter interface with in-memory implementation
  src/templates/ Built-in XSP templates (baseline, longform, extraction, summarization, customer-support)
```

## Storage

The current implementation uses an in-memory storage adapter. All data is seeded on startup and lost on server restart. The `StorageAdapter` interface is designed for pluggable backends (Azure Blob/Table Storage, AWS S3/DynamoDB) - contributions welcome.

## LLM integration

The editor supports _BYOK (Bring Your Own Key)_ LLM testing:

1. Go to **Settings** and configure your provider, model, and API key
2. Open the **Playground**, paste or write an XSP prompt
3. Fill in `$variable` values and click **Send to LLM**

API keys are stored in server memory only (never persisted to disk) and are never returned by the API. Keys are lost on server restart.

Supported providers: Anthropic, OpenAI, Azure OpenAI, and any OpenAI-compatible endpoint.

## Verification rules

The verification engine checks prompts against rules from the book:

| Rule | What it checks |
|------|---------------|
| `approved_tags` | All tags exist in the tag registry |
| `required_tags` | Tags marked as required are present |
| `empty_sections` | No tags with only whitespace inside |
| `nesting_depth` | Nesting does not exceed 3 levels |
| `variable_docs` | Every `$variable` has a documented description |
| `cdata_for_input` | `<input>` and `<untrusted_input>` use CDATA wrappers |
| `constraint_count` | Fewer than 15 constraints (over-specification heuristic) |
| `tag_count` | Fewer than 12 unique tag types (tag sprawl heuristic) |
| `output_format_present` | An `<output_format>` or `<output_contract>` tag exists |
| `pseudo_programming` | No `<if>`, `<else>`, `<for-each>` or similar tags |
| `redundant_nesting` | No deeply nested wrapper patterns |
| `constraint_conflicts` | No conflicting directives (e.g., "comprehensive" + word limit) |
| `example_overload` | Fewer than 5 few-shot examples |
| `over_specification` | Composite complexity score within bounds |

## Built-in templates

Five starter templates derived from the book:

- **Baseline** - Standard XSP with task, context, constraints, input, output format, examples, and checks
- **Longform** - Deep content with VCO framework sections
- **Extraction** - Structured data extraction with JSON output
- **Summarization** - Constrained summarization with audience targeting
- **Customer Support** - With injection defense layers and PII constraints

## Environment variables

See `.env.example` for available configuration options.

## Running tests

```bash
# Server tests
cd server && npm test

# Client tests
cd client && npm test
```

## License

MIT
