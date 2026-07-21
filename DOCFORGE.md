# DocForge

**Agent-grade document production using Typst as the rendering engine.**

This document is the canonical specification for DocForge: what it aims to be, how it works, what quality means, and how to build it in deliberate waves. It extends the product thesis in `MAIN.MD` with research-backed design decisions, explicit quality contracts, and a full development path.

### Epistemic status (read this first)

Statements in this doc fall into four buckets. Do not treat design choices or estimates as verified product facts.

| Status | Meaning | Examples in this doc |
|--------|---------|----------------------|
| **Verified** | Confirmed against Typst docs, MCP spec/SEP, or primary repo READMEs | Tagged PDF default in Typst 0.14+; `--pdf-standard ua-1`; typst-mcp tool list; primaviz “zero dependencies” |
| **Industry practice** | Widely recommended patterns, not DocForge-specific proof | MCP tool curation; schema-first agent outputs; golden-file PDF tests |
| **Design choice** | DocForge product/architecture decisions we are proposing | `document_id` handles; 7–10 tools; repair taxonomy; wave sequencing |
| **Target / estimate** | Aspirational metrics, timelines, or rankings | “&lt; 2s compile”; “80% self-recovery”; wave duration weeks |

Where a claim matters for implementation, the [appendix references](#appendix-e--research-references) point to primary sources. Speculative competitive claims are intentionally softened below.

---

## Table of contents

1. [North star](#1-north-star)
2. [The problem](#2-the-problem)
3. [What DocForge is — and is not](#3-what-docforge-is--and-is-not)
4. [Design principles](#4-design-principles)
5. [Users and workflows](#5-users-and-workflows)
6. [Conceptual architecture](#6-conceptual-architecture)
7. [The document model](#7-the-document-model)
8. [Input dialects](#8-input-dialects)
9. [The template system](#9-the-template-system)
10. [Brand kits](#10-brand-kits)
11. [Charts, diagrams, and math](#11-charts-diagrams-and-math)
12. [MCP surface and agent skill](#12-mcp-surface-and-agent-skill)
13. [Errors, diagnostics, and repair](#13-errors-diagnostics-and-repair)
14. [Quality assurance](#14-quality-assurance)
15. [Security posture](#15-security-posture)
16. [Competitive landscape](#16-competitive-landscape)
17. [Development waves](#17-development-waves)
18. [Success metrics](#18-success-metrics)
19. [Anti-patterns](#19-anti-patterns)
20. [Appendices](#20-appendices) (includes **Appendix H scope registry** — full traceability)

---

## 1. North star

### One-liner

**DocForge lets AI agents turn messy inputs into polished, accessible, branded PDFs — reliably.**

### Stronger framing

**Give any AI agent a professional document production department.**

The agent does not learn Typst. The agent fills schemas, reviews previews, and iterates on content. DocForge owns layout, rendering, validation, and repair.

### Core insight

> **Typst is the rendering/runtime layer, not the language the LLM is expected to master.**

Typst is a strong engine for this use case: incremental compilation, built-in JSON/CSV loading ([data loading docs](https://typst.app/docs/reference/data-loading/json)), **tagged PDF by default** (disable only via `--no-pdf-tags`; see [PDF export](https://typst.app/docs/reference/pdf/)), optional PDF/UA-1 and PDF/A conformance via `--pdf-standard`, and a large package ecosystem ([Typst Universe](https://typst.app/universe/)). Typst 0.14 (October 2025) is the accessibility baseline called out in official docs.

**Caveats (verified):** PDF/UA and PDF/A **cannot be targeted simultaneously** in current Typst ([PDF standards](https://typst.app/docs/reference/pdf/)). PDF/UA-1 export performs automated checks but **cannot verify everything** (e.g. color contrast, math alt text in natural language still needs author input — [accessibility guide](https://typst.app/docs/guides/accessibility/)).

The LLM-familiarity claim (“models know LaTeX better than Typst”) is observational, not measured here — it motivates the architecture either way. DocForge abstracts Typst behind **templates, schemas, and contracts**.

### Category

**Agent document-production runtime** — not a Typst utility, not a generic PDF API, not a WYSIWYG editor.

---

## 2. The problem

### Why agents fail at documents today

| Failure mode | Cause |
|--------------|-------|
| Formatting hallucination | Model invents layout instead of filling structure |
| Inconsistent output | HTML→PDF, Word automation, and ad-hoc LaTeX produce different results per run |
| No validation contract | Free-form text/JSON with no schema → silent layout breakage |
| Unrecoverable errors | Compiler stderr is not actionable for agents |
| No visual QA | Agent cannot see what the human will receive |
| No brand fidelity | Each generation looks different |
| Accessibility ignored | Untagged PDFs, missing alt text, broken heading hierarchy |

### Why now

AI agents increasingly need **deliverables**, not chat answers. Report generation, proposals, incident docs, board updates, and client-facing PDFs are becoming standard agent outputs. Existing tools optimize for *authoring* (Typst app, LaTeX) or *compilation* ([typst-mcp](https://github.com/johannesbrandenburger/typst-mcp)) — not for *agent production pipelines*.

### The reliability gap

Production agent systems need **schema-first structured outputs**: typed objects, deterministic validation, and retry loops on validation failure — not "please return JSON" in a prompt ([structured output patterns](https://visionforgestudio.com/blog/structured-outputs-ai-agents-crm-ops), [agent patterns catalog](https://github.com/agentpatternscatalog/patterns/blob/ad774f5fce1844c2816f6ffabe0bf1647d6f9177/patterns/structured-output.md)). DocForge applies this pattern to **documents**: the schema is the contract between agent and renderer.

---

## 3. What DocForge is — and is not

### DocForge is

- A **document factory** for agents: template + validated data → PDF
- A **schema teacher**: `get_template_schema` tells the agent exactly what to produce
- A **quality gate**: lint, preview, accessibility checks before export
- A **repair assistant**: deterministic fixes for common data/layout mismatches
- A **brand system**: repeatable visual identity across documents
- A **stateful runtime**: documents have identity, history, and diagnostics

### DocForge is not

- A Typst tutorial or documentation browser
- A general Typst IDE or compiler-as-a-service for arbitrary markup
- An HTML-to-PDF converter
- A replacement for the Typst web app
- A tool whose primary user is a Typst enthusiast

### Positioning (external)

| Weak | Strong |
|------|--------|
| "MCP server for Typst" | "Generate client-ready PDFs from agent workflows" |
| "Typst PDF generation" | "The report-generation runtime for AI agents" |
| "Compile Typst snippets" | "From messy notes and data to polished, branded PDFs" |

Mention Typst as a technical advantage. Lead with the deliverable.

---

## 4. Design principles

These principles govern every design decision. When in doubt, refer here.

### P1 — Schema before markup

The agent's primary output is **validated JSON** matching a template schema. Typst source is generated by DocForge, not authored by the agent. Raw Typst is an advanced escape hatch, never the default.

### P2 — Templates own layout; agents own content

Templates contain all layout logic: conditionals, pagination, calculations, section ordering, table formatting, and chart placement. Agents supply **meaning** (text, numbers, lists, claims). This mirrors how professional document shops work — and matches Typst's strength in [data-driven automated generation](https://typst.app/blog/2025/automated-generation/).

### P3 — Outcomes over operations

MCP tools are designed around **what the agent wants to achieve**, not atomic compiler steps ([MCP best practices](https://www.philschmid.de/mcp-best-practices), [WorkOS MCP design](https://workos.com/blog/designing-mcp-server-from-rest-api)). Prefer `docforge_create_document` over `write_file` + `run_typst` + `read_pdf`.

### P4 — Small, opinionated tool surface

Target **7–10 tools** for the core workflow. Every tool exposed is a tool the model can misuse. Tool descriptions are micro-documentation: when to use, what it returns, what to do on failure ([Speakeasy tool design](https://www.speakeasy.com/mcp/tool-design)).

### P5 — Errors are agent instructions

Every failure returns: `error_type`, human message, `agent_action`, `retryable`, and optional `suggested_repairs`. Raw compiler output is translated, never forwarded verbatim.

### P6 — Preview before delivery

No document is "done" until the agent (or human) has seen page previews. Visual QA is a first-class step, not an afterthought.

### P7 — Quality is contractual

Each template ships with: JSON Schema, sample data, golden PDF reference, lint rules, and accessibility requirements. A template that cannot pass its own quality contract is not shipped.

### P8 — Explicit state handles

Documents are identified by `document_id` handles passed between tool calls. State policy (TTL, scope) is documented in tool descriptions so the model can reason about it. This aligns with [SEP-2567](https://modelcontextprotocol.io/seps/2567-sessionless-mcp) (status: **Final**): explicit server-minted handles instead of protocol sessions. **Caveat:** SEP-2567 ships in the MCP **2026-07-28 release candidate** (prerelease as of May 2026; final spec targeted July 28, 2026). Many clients still use `2025-11-25` with sessions — DocForge’s handle pattern works on both; do not depend on RC-only transport features until SDKs catch up.

### P9 — Accessibility by default

Tagged PDF is Typst's default since 0.14. DocForge templates are authored for accessibility from the start: heading hierarchy, document titles, alt text on figures, sufficient contrast in brand palettes ([Typst accessibility guide](https://typst.app/docs/guides/accessibility/), [PDF/UA in production](https://typst-in-production.com/pdf-accessibility/)).

### P10 — Few excellent templates beat many mediocre ones

Template quality is the moat. Five templates that agents love are worth more than fifty that break on edge cases.

---

## 5. Users and workflows

### Primary users (Wave 1–3)

| Persona | Need |
|---------|------|
| AI automation builders | Reliable PDF step in agent pipelines |
| Internal tools teams | Branded reports from structured data |
| Consulting / agencies | Client-ready deliverables from agent research |
| Report-generation SaaS | Embeddable document runtime |
| Research / ops agents | Incident reports, postmortems, briefs |
| MCP power users | Document tools that actually work |

End users who only want a PDF are served **through** agents, not directly — until a later no-code wrapper.

### Canonical agent workflow

This is the workflow the MCP skill must teach. Every tool exists to support this sequence.

```text
1. list_templates
      → agent picks template for the task

2. get_template_schema
      → agent learns the exact JSON contract
      → agent may also read template README (resource)

3. [Agent extracts structured data from user inputs]
      → notes, transcripts, CSV, spreadsheets, screenshots described in text

4. create_document(template_id, data, brand_id?)
      → schema validation
      → returns document_id, missing_fields, warnings

5. compile_document(document_id)
      → Typst render
      → structured diagnostics on failure

6. preview_document(document_id, pages)
      → PNG thumbnails for visual QA

7. lint_document(document_id)
      → semantic + layout + accessibility warnings

8. [If issues] repair_document(document_id, repairs)
      → deterministic fixes
      → goto 5

9. export_document(document_id, formats)
      → PDF, source bundle, JSON archive
```

### Exemplar workflows (production workflows that prove the product)

**Board update from messy inputs**
- Input: founder notes, KPI CSV, logo, brand colors
- Output: 5-page PDF with executive summary, KPI cards, chart, risks, asks, appendix

**Incident report from transcript**
- Input: Slack/meeting transcript, timeline notes, screenshots
- Output: severity, timeline, root cause, action items, owners, evidence appendix

**Sales proposal from discovery**
- Input: call transcript, requirements, pricing table
- Output: branded proposal with scope, timeline, pricing, assumptions, next steps

These workflows define what "done" means for template and tool quality.

---

## 6. Conceptual architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                     MCP Client / Agent                          │
│   Skill instructs: schema-first, preview, lint, repair          │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     DocForge MCP Server                         │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ Tool layer  │  │ Orchestrator │  │ Structured errors   │  │
│  │ 7-10 tools  │  │              │  │ + repair engine     │  │
│  └──────┬──────┘  └──────┬───────┘  └─────────────────────┘  │
│         │                 │                                     │
│  ┌──────▼─────────────────▼────────────────────────────────┐  │
│  │                  Core services                            │  │
│  │  • Template registry    • Schema validator              │  │
│  │  • Project generator    • Brand kit compiler              │  │
│  │  • Chart/diagram emitter • Lint engine                  │  │
│  │  • Document store       • Compile scheduler             │  │
│  └──────┬──────────────────────────────────────────────────┘  │
└─────────┼───────────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────────┐
│                  Typst compile runtime                          │
│  • Pinned compiler version                                      │
│  • Per-document isolated workspace                              │
│  • Pinned package cache (allowlist only)                        │
│  • PDF + PNG export                                             │
└─────────────────────────────────────────────────────────────────┘
```

### Separation of concerns

| Layer | Responsibility |
|-------|----------------|
| **MCP tools** | Agent-facing API; input validation; response shaping |
| **Orchestrator** | Document lifecycle; coordinates services |
| **Template registry** | Versioned templates, schemas, samples, lint rules |
| **Project generator** | Materializes `data.json`, `theme.typ`, assets into workspace |
| **Schema validator** | JSON Schema validation with agent-actionable errors |
| **Brand kit compiler** | Brand JSON → `theme.typ` variables |
| **Chart/diagram emitter** | Semantic JSON → safe Typst fragments |
| **Lint engine** | Post-compile semantic and layout checks |
| **Repair engine** | Deterministic data/layout transforms |
| **Compile runtime** | Typst execution; diagnostics capture |
| **Document store** | Persistent document state and artifacts |

### Data flow (happy path)

```text
Agent JSON
    → validate against template schema
    → merge with brand kit → theme.typ
    → write data.json + assets into document workspace
    → copy template files (main.typ, components.typ, …)
    → typst compile → output.pdf + preview PNGs
    → lint (schema metadata + typst query + heuristics)
    → return document_id + previews + warnings
```

The agent never sees or edits `.typ` files in the default workflow.

---

## 7. The document model

DocForge is **stateful**. A compile-only tool is insufficient for production agent loops.

### Document record

```json
{
  "document_id": "doc_abc123",
  "template_id": "executive_memo",
  "template_version": "1.0.0",
  "brand_id": "northstar",
  "status": "compiled",
  "created_at": "2026-06-11T10:00:00Z",
  "updated_at": "2026-06-11T10:05:00Z",
  "data": { },
  "options": {
    "pdf_standard": "ua-1",
    "accessibility": true
  },
  "compile_history": [
    {
      "attempt": 1,
      "success": false,
      "diagnostics": []
    },
    {
      "attempt": 2,
      "success": true,
      "page_count": 4,
      "duration_ms": 120
    }
  ],
  "artifacts": {
    "pdf": "output.pdf",
    "previews": ["preview-1.png", "preview-2.png"],
    "source_zip": "source.zip"
  },
  "lint_results": [],
  "warnings": []
}
```

### Document states

```text
created → validated → compiling → compiled → linted → exported
                ↓           ↓
             failed      failed
                ↓           ↓
             repairable ←──┘
```

### Handle policy (documented in tool descriptions)

- `document_id` is minted by `create_document` and required for all subsequent calls
- Documents expire after configurable idle TTL (default: 24 hours)
- `destroy_document(document_id)` releases resources
- Handles are opaque, unguessable, and scoped to the caller

### Versioning

Documents pin `template_id@version`. Template upgrades never silently mutate existing documents. `upgrade_document_template(document_id, target_version)` is a Wave 6 capability.

---

## 8. Input dialects

DocForge accepts four input dialects. Only one is the production default.

### 8.1 Structured JSON (primary — 95% of traffic)

The agent produces JSON matching `get_template_schema`. This is the only dialect for Waves 0–3.

**Why JSON Schema:**
- Industry-standard contract format ([OpenAPI / JSON Schema](https://swagger.io/specification/))
- Validatable before any compilation
- Teachable to agents via `get_template_schema`
- Supports enums, constraints, required fields, nested structures
- Enables property-based fuzz testing of templates ([Schemathesis pattern](https://schemathesis.io/))

**Schema design guidelines for templates:**
- Prefer flat structures where possible; deep nesting increases agent error rate
- Use `enum` for closed choices (severity levels, status values)
- Put field descriptions in schema `description` keys (schema-first field descriptions are a common production pattern for LLM adherence; treat magnitude of benefit as unbenchmarked for DocForge)
- Include `examples` in schema for few-shot guidance
- Separate **content fields** from **metadata fields** (title, date, author, classification)
- Mark optional sections explicitly; templates handle absence gracefully

**Data delivery to Typst:**
- Write validated JSON to `data.json` in the document workspace
- Template loads via `#let data = json("data.json")`
- Prefer file-based loading over `sys.inputs` CLI flags for large payloads
- Never expose `sys.inputs` to agents directly

### 8.2 Markdown (prose sections — Wave 4)

For prose-heavy content, agents may supply Markdown strings in JSON fields (e.g., `sections[].body_md`). Typst does **not** parse Markdown natively; conversion requires a **vetted third-party package** (to be chosen and pinned in Wave 4 — not a built-in Typst feature). Agents still do not write Typst.

Use when: long narrative sections, research reports, incident timelines written as prose.

### 8.3 LaTeX math fragments (Wave 2+)

Agents supply LaTeX strings in designated fields (e.g., `equations[].latex`). Templates render via [MiTeX](https://typst.app/universe/package/mitex/) (current Universe version: **0.2.7**) inside controlled wrappers:

```typst
#import "@preview/mitex:0.2.7": mi, mitex
#mi(equation.latex)                    // inline
#mitex(equation.latex)                 // block (see MiTeX docs for delimiter forms)
```

**Rules:**
- **Math fragments only** — never full LaTeX documents. MiTeX’s `mitext` text mode exists but is marked **in development** on Universe; do not rely on it for production prose in early waves.
- Pin MiTeX to a specific version in `template.json`
- Unsupported LaTeX → `math_error` with actionable `agent_action` (DocForge behavior; MiTeX itself emits Typst compile errors)

### 8.4 Constrained Typst snippets (advanced — Wave 6+)

Power users may opt into pre-approved snippet slots within templates (e.g., custom footer text with escaping). Never arbitrary Typst. Never default.

---

## 9. The template system

Templates are DocForge's **primary product asset**. They are not just Typst files — they are complete production packages.

### 9.1 Template anatomy

Each template is a versioned package:

```text
templates/
  executive_memo/
    template.json       # metadata, version, compiler pin, package pins
    schema.json         # JSON Schema — the agent contract
    main.typ            # document shell, data loading, page setup
    components.typ      # reusable layout components
    theme.typ           # style variables (overridden by brand kit)
    lint_rules.json     # template-specific lint checks
    sample.json         # known-good example data
    golden-page1.png    # visual-regression baseline (generated, committed)
    README.md           # human + agent documentation
```

### 9.2 template.json

```json
{
  "id": "executive_memo",
  "version": "1.0.0",
  "name": "Executive Memo",
  "description": "1–5 page business memo with summary, sections, risks, and action items",
  "category": "business",
  "typst_version": ">=0.14.0",
  "packages": {
    "@preview/mitex": "0.2.7"
  },
  "page_budget": { "min": 1, "max": 8 },
  "inputs": ["title", "summary", "sections", "risks", "actions"],
  "outputs": ["pdf", "png_preview", "source_zip"],
  "accessibility": {
    "pdf_standard": "ua-1",
    "requires_alt_text": true,
    "requires_document_title": true
  }
}
```

### 9.3 Template authoring principles

**Let the template be smart.** Typst's scripting language handles conditionals, calculations, and loops — reducing agent burden ([Typst automated generation](https://typst.app/blog/2025/automated-generation/)):

| Logic | Template handles | Agent supplies |
|-------|------------------|----------------|
| Show risk matrix only if risks exist | `#if data.risks.len() > 0 { ... }` | `risks: []` or omit |
| Calculate totals | `calc.sum(...)` | line items |
| Paginate appendix | template structure | appendix content |
| Choose compact layout if long | page count heuristic | content |
| Format dates and currency | locale formatters | raw values |

**Embed document introspection for linting.** Templates emit `#metadata(...)` labels queryable after compile via the CLI ([`typst query`](https://typst.app/docs/reference/introspection/query/) — documented; `typst eval` is an alternate path in newer docs):

```typst
#metadata((type: "section", title: section.title, empty: section.body == "")) <lint-section>
#metadata((type: "todo_placeholder", found: section.body.contains("TODO"))) <lint-todo>
```

This enables deterministic lint without vision models.

### 9.4 Template quality bar

A template is **shippable** only when it passes all of:

| Gate | Requirement |
|------|-------------|
| Schema valid | `schema.json` is valid JSON Schema Draft 2020-12 |
| Sample compiles | `sample.json` → PDF with zero errors |
| Golden match | First-page render matches committed `golden-page1.png` within tolerance |
| Page budget | Respects `page_budget` with sample and stress-test data |
| Empty-state | Graceful rendering when all optional sections omitted |
| Overflow stress | Wide tables, long strings, 50+ list items do not crash |
| Accessibility | Passes PDF/UA-1 export when `accessibility: true` |
| Alt text | All figures have alt text paths in schema |
| Lint clean | Zero errors on `sample.json`; expected warnings documented |
| Agent README | README explains when to use, required fields, example workflow |
| Malicious input | Fuzz test: giant strings, weird Unicode, injection-like fragments |

### 9.5 Template categories (full portfolio target)

**Wave 2 — Business (5 templates)**

| Template | Pages | Core schema fields |
|----------|-------|-------------------|
| Executive memo | 1–5 | title, summary, sections, risks, actions |
| Sales proposal | 5–15 | client, scope, timeline, pricing, assumptions |
| Research report | 10–30 | title, abstract, sections, findings, sources |
| Incident report | 3–10 | severity, timeline, impact, root_cause, actions |
| KPI report | 2–8 | period, kpis, charts, commentary |

**Wave 4 — Operations**

| Template | Purpose |
|----------|---------|
| Postmortem | Blameless incident review |
| Project status | Weekly status with RAG indicators |
| Decision record | ADR-style decision documentation |
| Meeting brief | Pre-meeting context doc |
| Risk assessment | Risk matrix + mitigations |

**Wave 5 — Data**

| Template | Purpose |
|----------|---------|
| Monthly metrics | CSV-driven KPI dashboard PDF |
| Survey report | Response breakdown + charts |
| Financial snapshot | P&L summary tables |
| Cohort analysis | Retention/cohort tables + charts |

**Wave 6 — Professional**

| Template | Purpose |
|----------|---------|
| Invoice / quote | Line items, totals, payment terms |
| Contract summary | Clause sections, parties, dates |
| CV / resume | Structured career data |
| Client intake summary | Discovery notes → formatted summary |

### 9.6 Template versioning policy

- Semantic versioning: `MAJOR.MINOR.PATCH`
- **MAJOR**: breaking schema changes (removed required fields, restructured data)
- **MINOR**: backward-compatible additions (new optional fields, new sections)
- **PATCH**: layout fixes, typo corrections, no schema changes
- Documents pin the version used at creation
- `list_templates` returns current version; `get_template_schema` accepts optional `version` param

---

## 10. Brand kits

Brand kits make DocForge commercially valuable. They turn generic templates into client-specific deliverables.

### 10.1 Brand kit schema

```json
{
  "id": "northstar",
  "name": "Northstar Analytics",
  "logo": "logo.svg",
  "colors": {
    "primary": "#111111",
    "accent": "#E6B800",
    "muted": "#666666",
    "background": "#FFFFFF",
    "text": "#1A1A1A"
  },
  "fonts": {
    "heading": "Inter",
    "body": "Inter",
    "mono": "JetBrains Mono"
  },
  "footer": "Confidential — Northstar Analytics",
  "header": null,
  "tone": "minimal, premium, analytical"
}
```

### 10.2 Brand kit → theme.typ

DocForge compiles brand JSON into Typst variables injected into every template:

```typst
// Generated — do not edit
#let brand-primary = rgb("#111111")
#let brand-accent = rgb("#E6B800")
#let brand-footer = "Confidential — Northstar Analytics"
```

### 10.3 Font policy

| Wave | Policy |
|------|--------|
| 1–2 | Bundled safe fonts only (Typst defaults: Libertinus, New Computer Modern, DejaVu) |
| 3 | Brand kit font selection from approved list |
| 5+ | Custom font upload (enterprise, with licensing attestation) |

Fonts are the primary source of licensing complexity and non-deterministic rendering. Default to bundled fonts until the template portfolio is proven.

### 10.4 Accessibility in brand kits

Brand kit compiler validates:
- Color contrast ratio ≥ 4.5:1 for text on background (WCAG AA)
- Accent colors do not reduce readability when used for emphasis
- Logo alt text is required in brand kit schema

---

## 11. Charts, diagrams, and math

### 11.1 Principle: semantic in, rendering out

Agents describe **meaning**. DocForge owns **rendering**. The agent never imports Typst packages or writes drawing code.

This mirrors the insight from `MAIN.MD` and avoids the primary failure mode of LLM-generated diagrams.

### 11.2 Chart API (Wave 4)

Agent supplies chart JSON in document data:

```json
{
  "type": "bar",
  "title": "Revenue by Quarter",
  "data": [
    { "label": "Q1", "value": 120000 },
    { "label": "Q2", "value": 180000 }
  ],
  "options": {
    "unit": "EUR",
    "show_values": true
  }
}
```

DocForge validates against a chart schema enum (`bar`, `line`, `pie`, `stacked_bar`, `kpi_card`, …) and emits Typst via a **pinned** chart package. Verified options:

| Package | Verified claim | Dependency note |
|---------|----------------|-----------------|
| [primaviz](https://typst.app/universe/package/primaviz/) | “50+ chart types”, “zero dependencies” (Universe + GitHub README) | Pure Typst primitives — preferred default for DocForge chart emitter |
| [cetz-plot](https://typst.app/universe/package/cetz-plot/) | CeTZ-based plotting | Depends on **cetz** (not zero-dep) |
| [lilaq](https://typst.app/universe/package/lilaq/) | Scientific plots | Multiple package dependencies |

Package choice is a **design decision** per template; do not let agents import packages directly.

### 11.3 Diagram API (Wave 4)

```json
{
  "type": "process",
  "nodes": [
    { "id": "intake", "label": "Intake" },
    { "id": "review", "label": "Review" },
    { "id": "approve", "label": "Approve" }
  ],
  "edges": [
    ["intake", "review"],
    ["review", "approve"]
  ]
}
```

Rendered via [fletcher](https://typst.app/universe/package/fletcher/) (0.5.8 on Universe; **built on CeTZ**, not zero-dependency). DocForge’s semantic diagram types (`process`, `flowchart`, `tree`; `sequence` in Wave 5) are **our JSON API** — fletcher does not expose these names natively; the emitter maps JSON → fletcher `diagram`/`node`/`edge` calls.

### 11.4 Math (Wave 2)

LaTeX math strings in schema fields, rendered by MiTeX inside template wrappers. Validated for compile success; unsupported commands return structured `math_error`.

### 11.5 Image assets

Agents attach images via document data:

```json
{
  "figures": [
    {
      "id": "architecture",
      "file": "architecture.png",
      "caption": "System architecture",
      "alt": "Diagram showing three tiers: client, API, database"
    }
  ]
}
```

Rules:
- Alt text required when `accessibility: true`
- Max dimensions and file size enforced
- SVG sanitized before inclusion
- Images stored in document workspace `assets/`

---

## 12. MCP surface and agent skill

### 12.1 Tool design rules

Following [MCP tool best practices](https://www.philschmid.de/mcp-best-practices) and [Microsoft MCP builder guidance](https://github.com/microsoft/agent-skills/blob/eceed4a9fd0809d9460a9e86750cbf4c658d6b97/.github/skills/mcp-builder/reference/mcp_best_practices.md):

- **Prefix**: all tools use `docforge_` prefix
- **Count**: 7–10 core tools; resist expansion
- **Names**: snake_case, action-oriented (`docforge_create_document`)
- **Descriptions**: micro-documentation with when-to-use, return shape, error recovery
- **Annotations**: `readOnlyHint`, `destructiveHint`, `idempotentHint` on each tool
- **Returns**: structured JSON; summaries for large results; previews as resources

### 12.2 Core tools

#### `docforge_list_templates`

Returns available templates with id, description, version, category, page budget, required inputs.

Read-only. Cacheable. Agent uses this to select the right template.

#### `docforge_get_template_schema`

**The most important tool.** Returns JSON Schema for a template plus field descriptions, examples, and the template README.

This is how the agent learns what to produce. The schema response should be self-sufficient — an agent with only this tool and the schema should be able to produce valid data.

#### `docforge_create_document`

```json
{
  "template_id": "executive_memo",
  "data": {},
  "brand_id": "default",
  "options": { "accessibility": true }
}
```

Returns: `document_id`, `status`, `missing_fields[]`, `warnings[]`.

Validates data against schema before creating. Does not compile.

#### `docforge_compile_document`

Compiles document to PDF + preview PNGs. Returns structured diagnostics on failure.

Long compiles may use the MCP **Tasks extension** ([overview](https://modelcontextprotocol.io/extensions/tasks/overview)) — status: **experimental** as of 2025-11-25 spec utilities. Use when compile exceeds client timeout thresholds (threshold is a **design choice**, not a protocol constant).

#### `docforge_preview_document`

```json
{
  "document_id": "doc_123",
  "pages": [1, 2, 3],
  "dpi": 120
}
```

Returns page count, preview image references (MCP resources or base64), and layout metadata (dimensions).

#### `docforge_lint_document`

Runs lint checks. Returns actionable warnings with severity, check name, location, and `agent_action`.

#### `docforge_repair_document`

```json
{
  "document_id": "doc_123",
  "repairs": ["rename_field:metrics→kpis", "add_default:sections[2].title"]
}
```

Applies deterministic repairs. Returns what changed. Does not compile — agent should recompile.

#### `docforge_export_document`

```json
{
  "document_id": "doc_123",
  "formats": ["pdf", "source_zip", "json"]
}
```

Returns download references for final artifacts.

#### `docforge_destroy_document` (optional, Wave 2)

Releases document resources. Idempotent.

### 12.3 MCP resources (read-only context)

Expose templates and document artifacts as resources — not tools — to save context window:

| Resource URI | Content |
|--------------|---------|
| `docforge://templates` | Template catalog |
| `docforge://templates/{id}/readme` | Template agent documentation |
| `docforge://templates/{id}/sample` | Sample JSON |
| `docforge://documents/{id}/preview/{page}` | Preview PNG |
| `docforge://documents/{id}/pdf` | Compiled PDF |

### 12.4 Agent skill

The MCP is the renderer. The **skill** is the agent behavior. Ship a skill file (Cursor rule / agent skill) that instructs:

1. **Never generate raw Typst** unless the user explicitly requests advanced mode.
2. **Always** follow: `list_templates` → `get_template_schema` → `create_document`.
3. Treat JSON data as the contract; validate mentally against schema before calling.
4. Use LaTeX only for math fragments in designated schema fields.
5. **Always** `preview_document` before final delivery.
6. **Always** `lint_document` before `export_document`.
7. On compile failure: read `agent_action`, attempt `repair_document`, recompile. Do not freestyle Typst fixes.
8. Keep analytical claims source-linked when the template supports citations.
9. Treat brand kits and accessibility as production requirements, not optional.
10. When data is incomplete, ask the user for missing required fields — do not invent content for `summary` or `risks` without labeling assumptions.

The skill is product magic: you are teaching agents a **robust document workflow**, not giving them a compiler.

---

## 13. Errors, diagnostics, and repair

### 13.1 Error taxonomy

Every error has a type, stage, message, agent action, and retryability.

| Type | Stage | Example | Agent action |
|------|-------|---------|--------------|
| `schema_error` | validation | Missing `sections[].title` | Add title for each section |
| `template_error` | generation | Template bug (internal) | Report; try different template |
| `compile_error` | typst_compile | Unknown variable in template | Check data/template mismatch; try repair |
| `asset_error` | assets | Missing logo file | Re-upload asset or remove reference |
| `layout_warning` | post_compile | Table may overflow | Accept or request `split_table` repair |
| `accessibility_warning` | export | Missing alt text on figure | Add alt text to figure data |
| `accessibility_error` | export | PDF/UA-1 check failed | Fix heading hierarchy or add metadata |
| `math_error` | render | Unsupported LaTeX command | Simplify equation |
| `budget_error` | post_compile | Document exceeds page limit | Reduce content or split into appendix |
| `timeout_error` | compile | Compile exceeded time limit | Reduce content complexity |

### 13.2 Diagnostic shape

```json
{
  "success": false,
  "error_type": "schema_error",
  "stage": "validation",
  "message": "Template requires sections[].title",
  "location": {
    "path": "$.sections[2]",
    "field": "title"
  },
  "agent_action": "Add a short title for section 3, or remove the empty section",
  "retryable": true,
  "repair_available": true,
  "suggested_repairs": ["add_default_title:sections[2]", "remove_empty_section:2"]
}
```

### 13.3 Repair philosophy

Repairs are **deterministic transforms**, never LLM guesses.

| Repair | What it does |
|--------|-------------|
| `rename_field` | Map wrong key to expected key (`metrics` → `kpis`) |
| `add_default` | Insert default value for missing optional field |
| `remove_empty_section` | Drop section with no body |
| `split_wide_table` | Break table into multiple pages or appendix |
| `truncate_string` | Trim string exceeding max length with ellipsis |
| `add_document_title` | Set title from first heading if missing |
| `add_alt_text` | Generate generated alt text from caption (with warning) |
| `escape_text` | Escape characters that break Typst rendering |
| `normalize_dates` | Parse common date formats to ISO |

Repairs that infer content (generated alt text, default titles) produce **warnings** so the agent can improve them.

### 13.4 Compile diagnostic translation

Raw Typst errors are translated:

```text
Typst: "unknown variable: kpis"
  → error_type: compile_error
  → message: "Template expects data field `metrics` but received `kpis`"
  → agent_action: "Rename `kpis` to `metrics` in your data, or apply repair: rename_field:kpis→metrics"
  → repair_available: true
```

Maintain a mapping table from common Typst errors to agent actions. Expand over time from compile failure logs.

---

## 14. Quality assurance

Quality is not a phase — it is a **continuous contract** enforced at every wave.

### 14.1 Three layers of quality

```text
Layer 1: Schema validation     — data is well-formed
Layer 2: Compile + lint        — document renders correctly
Layer 3: Visual + accessibility — document looks right and is accessible
```

### 14.2 Lint checks

**Generic checks (all templates):**

| Check | Severity | Method |
|-------|----------|--------|
| `missing_document_title` | error | PDF metadata / typst query |
| `todo_placeholders` | warning | typst metadata query |
| `empty_sections` | warning | typst metadata query |
| `missing_alt_text` | error (if accessibility) | schema + compile |
| `page_count_over_budget` | warning | page count |
| `blank_pages` | warning | page count + content query |
| `heading_hierarchy` | error (if PDF/UA) | typst query for heading levels |
| `low_resolution_image` | warning | asset dimension check |
| `inconsistent_dates` | warning | schema cross-field validation |
| `unsupported_claims` | info | heuristic: "definitely", "guaranteed" without source |

**Template-specific checks** (`lint_rules.json`):

```json
{
  "checks": [
    {
      "id": "executive_summary_length",
      "severity": "warning",
      "rule": "summary word count between 50 and 300"
    },
    {
      "id": "risks_have_mitigations",
      "severity": "warning",
      "rule": "each risk must have mitigation field when severity >= high"
    }
  ]
}
```

### 14.3 Preview and visual QA

**Wave 1–3: Agent-reviewed previews**
- Compile produces PNG previews per page
- Agent inspects visually (multimodal) before export
- Return page count + dimensions as structured metadata

**Wave 5+: Automated layout heuristics**
- Detect obvious overflow (text clipped at page edges via render analysis)
- Flag headings at page bottom
- Flag charts with unreadable labels
- Compare against golden preview with pixel diff ([pdf-visual-diff pattern](https://www.npmjs.com/package/pdf-visual-diff))

**Wave 6+: Vision-assisted QA (optional)**
- MCP returns previews; vision-capable agent evaluates layout
- DocForge does not require vision — it enables it

### 14.4 Golden-file testing

Every template must have a golden test suite:

```text
sample.json → compile → compare:
  ✓ zero compile errors
  ✓ page count matches expected
  ✓ PDF metadata (title, page count)
  ✓ lint produces expected warnings (if any)
  ✓ visual diff against golden-page1.png within threshold
  ✓ PDF/UA-1 export succeeds (if accessibility enabled)
```

**Stress tests per template:**

| Input | Expected behavior |
|-------|-------------------|
| All optional fields omitted | Minimal valid document |
| Maximum page budget data | Renders within budget or `budget_error` |
| Giant string (10K chars) | Truncation or overflow warning, no crash |
| Weird Unicode (RTL, emoji, ZWJ) | Renders or clean error |
| 100 table rows | Renders or split suggestion |
| Invalid image file | `asset_error` with clear message |
| Schema-invalid data | `schema_error` before compile |

### 14.5 Accessibility quality

Leverage Typst 0.14+ accessibility features ([Typst 0.14 blog](https://typst.app/blog/2025/typst-0.14/)):

- Tagged PDF by default — do not disable
- PDF/UA-1 export mode (`--pdf-standard ua-1` per [Typst CLI](https://typst.app/docs/reference/pdf/); mutually exclusive with PDF/A in same export)
- Templates enforce: document title, heading hierarchy starting at level 1, alt text on all figures
- Brand kit contrast validation
- Manual review checklist for color contrast and reading order (automated checks are necessary but not sufficient — [typst-in-production guidance](https://typst-in-production.com/pdf-accessibility/))

### 14.6 Template review process

Before a template graduates from draft to released:

1. Author completes template anatomy checklist (Appendix A)
2. Sample data compiles to golden PDF
3. Golden tests pass in CI
4. Agent workflow test: given sample inputs, can an LLM produce valid JSON and reach export?
5. Human visual review of sample output
6. Accessibility review (PDF/UA-1 pass)
7. README reviewed for agent clarity

---

## 15. Security posture

Security matters but is not the product. DocForge should be a **locked-down renderer**.

### Non-negotiables

- Agents never execute shell commands
- Compilation in isolated per-document workspace
- No network access during compile (offline package cache)
- Package allowlist only — no arbitrary `@preview/*`
- Asset MIME validation and size limits
- Page count, compile timeout, and memory limits
- No leaking host paths in error messages
- All tool inputs validated against JSON Schema at the MCP boundary

Typst’s documented sandbox model: documents read files within the project root; compilation does not access arbitrary network or host programs ([open-source FAQ](https://typst.app/open-source/)). That is a **foundation**, not sufficient for hostile multi-tenant input. DocForge adds policy (allowlists, caps, offline cache). Effectiveness of subprocess vs embedded `World` sandboxing must be validated during Wave 0 — not assumed.

---

## 16. Competitive landscape

### typst-mcp ([GitHub](https://github.com/johannesbrandenburger/typst-mcp))

**Verified capabilities** (from upstream README): `list_docs_chapters`, `get_docs_chapter`, `latex_snippet_to_typst` (**Pandoc**), `check_if_snippet_is_valid_typst_syntax`, `typst_to_image` (snippet → PNG). Python, MIT, ~130–160 GitHub stars (order of magnitude; changes over time). Requires cloning Typst to generate bundled docs JSON for the docs tools.

A Typst **utility server** — teaches agents to write/validate Typst and preview snippets. **No** template registry, JSON Schema contract, multi-page PDF deliverable workflow, document handles, lint, or repair loop in the public README.

**DocForge difference (design):** agents fill schemas; DocForge owns Typst source.

### typst-business-templates / docgen ([GitHub](https://github.com/casoon/typst-business-templates))

**Verified:** Rust CLI/library embedding Typst; JSON-driven business templates (invoice, offer, etc.); README documents sharing JSON schemas with AI and reviewing before compile. Small, young repo (low star count as of 2026 — validate maturity before treating as production reference).

**Not verified / not claimed by upstream:** MCP server, structured agent error taxonomy, preview loop, document state.

**DocForge difference (design):** MCP-native agent workflow. Worth studying docgen’s schema-sharing and template layout patterns — not a competitor MCP.

### HTML→PDF pipelines (Puppeteer, wkhtmltopdf, etc.)

Common agent shortcut. **Observed weaknesses** (varies by stack): layout sensitivity to CSS/browser, weaker PDF/UA story than Typst’s tagged-PDF path, no first-class data-template split. DocForge’s bet is Typst-native determinism — **validate per use case**, not universally true.

### Raw LaTeX generation

LLMs often produce LaTeX more readily than Typst (anecdotal). Full LaTeX pipelines suffer from slow compiles, package conflicts, and manual accessibility work in practice. DocForge uses MiTeX for **math fragments only** (verified: MiTeX equation support; full-document LaTeX is out of scope).

### DocForge's whitespace (hypothesis — not a market study)

```text
templates + schemas + brand kits + charts + preview + lint + repair
+ secure compilation + agent-friendly errors + document lifecycle
```

**Honest scope:** We have **not** conducted a systematic market scan. No widely adopted MCP server was found that combines all of the above. Adjacent tools exist (typst-mcp, docgen CLI, Typst app, Pandoc/LaTeX pipelines). The gap is **credible** from manual review, not proven by citation.

---

## 17. Development waves

Development is organized in **waves** — each wave delivers a coherent capability increment with explicit quality gates. Waves are sequential; do not skip ahead without meeting exit criteria.

```text
Wave 0 ─── Engine proof
Wave 1 ─── Agent contract
Wave 2 ─── Template portfolio (business)
Wave 3 ─── Brand + accessibility
Wave 4 ─── Data + visuals
Wave 5 ─── Repair + QA automation
Wave 6 ─── Reporting power
Wave 7 ─── Designer + ecosystem
```

---

### Wave 0 — Engine proof

**Goal:** Prove the Typst compile pipeline works with structured data and returns agent-useful diagnostics.

**Duration estimate (planning guess):** 1–2 weeks

**Deliverables:**

| Item | Detail |
|------|--------|
| Compile runtime | Pinned Typst binary; per-document temp workspace; PDF + PNG export |
| One template | `executive_memo` v0 — hardcoded, single file acceptable |
| One schema | `schema.json` for executive memo |
| One sample | `sample.json` → golden PDF |
| Diagnostic capture | Typst stderr → structured JSON (error line, message, stage) |
| Basic sandbox | Project root isolation; compile timeout; no network |

**Not in scope:** MCP server, multiple templates, brand kits, lint, repair.

**Repository layout (Wave 0 establishes this skeleton):**

```text
typstmcp/           # repo root (package.json here)
  src/
    compile/
    sandbox/
    mcp/
    validation/
  templates/
    executive_memo/
      template.json
      schema.json
      main.typ
      sample.json
      golden-page1.png  # visual-regression baseline (generated, committed)
  tests/
  package.json
```

**Exit criteria:**

- [ ] `sample.json` compiles to PDF in < 2 seconds
- [ ] PNG previews generated for all pages
- [ ] Invalid data produces structured diagnostic (not raw stderr)
- [ ] Compile timeout kills runaway documents
- [ ] One stress test passes (giant string does not crash host)

---

### Wave 1 — Agent contract

**Goal:** Ship the MCP server with the core agent workflow. One excellent template end-to-end.

**Duration estimate (planning guess):** 2–3 weeks

**Deliverables:**

| Item | Detail |
|------|--------|
| MCP server | stdio transport; TypeScript SDK |
| Core tools | `list_templates`, `get_template_schema`, `create_document`, `compile_document`, `preview_document`, `export_document` |
| Document store | `document_id` lifecycle; local filesystem |
| Schema validator | JSON Schema validation with `agent_action` errors |
| `executive_memo` v1.0 | Full template anatomy; README; golden tests |
| Agent skill file | Cursor rule / skill with canonical workflow |
| Error taxonomy | v1 subset of error types (see §13; full taxonomy is 10 types) |

**Exit criteria:**

- [ ] Agent can complete full workflow using only MCP tools + skill
- [ ] `get_template_schema` is sufficient for an LLM to produce valid `sample.json` equivalent
- [ ] Failed compile returns `error_type` + `agent_action` + `retryable`
- [ ] Preview PNGs accessible to multimodal agent
- [ ] Golden test: `sample.json` → PDF matches committed reference
- [ ] Workflow: text notes → agent extracts data → executive memo PDF

---

### Wave 2 — Template portfolio (business)

**Goal:** Five production-quality business templates. DocForge can complete all three core workflows.

**Duration estimate (planning guess):** 4–6 weeks

**Deliverables:**

| Template | Priority |
|----------|----------|
| Executive memo | polish v1 template to production quality |
| Sales proposal | new |
| Research report | new |
| Incident report | new |
| KPI report | new |

| Item | Detail |
|------|--------|
| `docforge_lint_document` | Generic lint checks (todo, empty sections, page budget, missing title) |
| `docforge_destroy_document` | Resource cleanup |
| LaTeX math | MiTeX integration in templates with `equations[]` schema fields |
| Template versioning | `template.json` version pinning |
| MCP resources | Template README and sample as resources |
| Fuzz tests | Malicious/edge-case input suite per template |

**Exit criteria:**

- [ ] All 5 templates pass golden tests + stress tests
- [ ] All 5 templates have agent README sufficient for schema-first generation
- [ ] Core workflow works: CSV + notes → board update (KPI report)
- [ ] Incident workflow works: transcript → incident report
- [ ] Proposal workflow works: discovery notes → sales proposal
- [ ] Lint catches unfinished markers and empty sections
- [ ] Math fragments render via MiTeX

---

### Wave 3 — Brand + accessibility

**Goal:** Branded, accessible PDFs are a production requirement, not an option.

**Duration estimate (planning guess):** 3–4 weeks

**Deliverables:**

| Item | Detail |
|------|--------|
| Brand kit system | Schema, storage, `theme.typ` compiler |
| Default brand kit | Shipped with DocForge |
| Brand kit validation | Contrast checking, required logo alt text |
| PDF/UA-1 export mode | `--pdf-standard ua-1` option in `create_document` |
| Accessibility lint | `missing_alt_text`, `heading_hierarchy`, `missing_document_title` |
| `accessibility_error` type | Compile fails with clear agent_action when PDF/UA-1 violated |
| Template updates | All 5 templates support brand kits and accessibility mode |

**Exit criteria:**

- [ ] Branded workflow (logo, colors, footer) produces branded PDF
- [ ] PDF/UA-1 export succeeds for all 5 templates with `sample.json`
- [ ] Accessibility lint catches missing alt text before export
- [ ] Brand kit with low-contrast colors rejected at validation
- [ ] All templates pass accessibility review checklist (Appendix B)

---

### Wave 4 — Data + visuals

**Goal:** Data-driven reports with charts, diagrams, and CSV ingestion.

**Duration estimate (planning guess):** 4–5 weeks

**Deliverables:**

| Item | Detail |
|------|--------|
| Chart API | Semantic JSON → primaviz/cetz-plot Typst emission |
| Diagram API | process, flowchart, tree via fletcher |
| CSV ingestion | `create_document` accepts CSV attachment → parsed into data |
| Markdown fields | `body_md` fields in schemas → rendered prose |
| KPI report upgrade | Charts, KPI cards, trend indicators |
| Research report upgrade | Figure support, citation fields |
| 3 data templates | Monthly metrics, survey report, financial snapshot |

**Exit criteria:**

- [ ] KPI report renders bar, line, and KPI card charts from JSON
- [ ] Diagram API renders process flowchart in proposal template
- [ ] CSV → monthly metrics PDF works end-to-end
- [ ] Markdown prose renders correctly in research report sections
- [ ] Chart API rejects unsupported chart types with `schema_error`
- [ ] All new templates pass golden + stress tests

---

### Wave 5 — Repair + QA automation

**Goal:** Close the agent self-correction loop. Reduce human intervention.

**Duration estimate (planning guess):** 3–4 weeks

**Deliverables:**

| Item | Detail |
|------|--------|
| `docforge_repair_document` | 8+ deterministic repair transforms |
| Repair suggestions | Failed compile/lint auto-suggests repairs |
| Typst error translation | 20+ common errors mapped to agent actions |
| Automated layout heuristics | Overflow, orphan heading, blank page detection |
| Golden visual regression | Pixel diff against committed previews in CI |
| MCP Tasks support | Async compile for large documents |
| Compile history | Full attempt log on document record |

**Exit criteria:**

- [ ] Agent recovers from 5 common failure scenarios using repair + recompile without human help
- [ ] `rename_field` repair fixes schema/compile key mismatches
- [ ] Visual regression CI catches template layout changes
- [ ] Large (20+ page) document compiles via async task without MCP timeout
- [ ] Compile diagnostic translation covers 80% of observed errors

---

### Wave 6 — Reporting power

**Goal:** Enterprise-grade reporting features for analytical and compliance workflows.

**Duration estimate (planning guess):** 4–6 weeks

**Deliverables:**

| Item | Detail |
|------|--------|
| Appendix generation | Auto-appendix for sources, raw data, evidence |
| Citation system | `sources[]` schema field → formatted bibliography |
| Document versioning | `document_version`, compare two versions |
| Template upgrade | `upgrade_document_template(document_id, version)` |
| 4 operations templates | Postmortem, project status, decision record, meeting brief |
| 2 professional templates | Invoice/quote, contract summary |
| PDF/A export | `--pdf-standard a-2a` option |
| Constrained Typst snippets | Opt-in advanced mode for footer/custom blocks |

**Exit criteria:**

- [ ] Research report with 10 sources generates citation appendix
- [ ] Version comparison highlights changed sections (data diff + preview diff)
- [ ] Invoice template with line items calculates totals correctly
- [ ] PDF/A-2a export succeeds for compliance-mode documents
- [ ] 4 operations templates pass full quality gates

---

### Wave 7 — Designer + ecosystem

**Goal:** Expand from runtime to platform. Custom templates, visual QA, marketplace.

**Duration estimate (planning guess):** ongoing / unbounded

**Deliverables:**

| Item | Detail |
|------|--------|
| Visual QA loop | Vision-model-assisted layout evaluation via preview metadata |
| Layout repair | Auto-split tables, reflow sections, adjust font size |
| Brand extraction | Extract brand kit from existing PDF/logo upload |
| Template generator | Agent-assisted template creation from document description |
| Template marketplace | Community template packages with schema + golden tests |
| Custom template loading | User-supplied templates with schema validation |
| Remaining portfolio | CV, client intake, risk assessment, cohort analysis |
| Hosted runtime | Multi-tenant document production (if desired) |

**Exit criteria:**

- [ ] User can create a custom template, validate schema, and generate documents
- [ ] Visual QA catches layout issue that lint missed (validated on test set)
- [ ] 3+ community templates available in marketplace
- [ ] Full template portfolio (20+ templates) at production quality

---

### Wave dependency graph

```text
Wave 0 ──→ Wave 1 ──→ Wave 2 ──→ Wave 3
                              └──→ Wave 4 ──→ Wave 5 ──→ Wave 6 ──→ Wave 7
```

Waves 3 and 4 can partially overlap once Wave 2 templates are stable (brand kits apply to existing templates; chart API is needed for new data templates).

---

## 18. Success metrics

### Per-wave metrics

| Wave | Key metric |
|------|------------|
| 0 | Compile success rate = 100% on sample data |
| 1 | Agent completes full workflow without human intervention |
| 2 | 3 core workflows work end-to-end |
| 3 | PDF/UA-1 pass rate = 100% on all templates |
| 4 | Chart + CSV documents render correctly |
| 5 | Agent self-recovery rate ≥ 80% on common errors |
| 6 | Citation appendix correct on research report |
| 7 | Custom template created and used by agent |

### Product metrics (ongoing — aspirational targets, not verified baselines)

| Metric | Target | Notes |
|--------|--------|-------|
| Schema validation catch rate | > 95% of bad data caught before compile | Measure with fuzz corpus per template |
| Compile success rate (valid data) | > 99% | Valid = passes schema + golden samples |
| Agent workflow completion rate | > 90% without human intervention | Requires agent eval harness; definition of “completion” must be fixed |
| Mean time to PDF (from create_document) | < 5 seconds for standard docs | Typst is fast; PNG export may dominate — benchmark in Wave 0 |
| Template golden test pass rate | 100% in CI | Objective |
| Accessibility compliance | 100% PDF/UA-1 when enabled | Typst enforces many rules; manual checks still required |

---

## 19. Anti-patterns

### Do not

| Trap | Why |
|------|-----|
| Default to raw Typst generation | Fragile; LLMs unreliable at Typst |
| Ship as "Typst MCP" | Wrong audience; too small a market |
| Expose 40 tools | Context bloat; model confusion |
| Allow arbitrary package imports | Security + reproducibility nightmare |
| Build a Typst editor | Competes with Typst app; not your product |
| Skip golden tests | Template regressions will erode trust |
| Let agents write `.typ` files | Bypasses schema contract |
| Ship templates without README | Agents cannot learn the schema workflow |
| Invent content in repair | Repairs transform; they do not hallucinate |
| Disable PDF tagging | Accessibility regression |
| Rush template count over quality | Five excellent > fifty mediocre |

---

## 20. Appendices

### Appendix A — Template completion checklist

```text
□ template.json with version, compiler pin, package pins
□ schema.json (valid JSON Schema Draft 2020-12)
□ main.typ, components.typ, theme.typ
□ sample.json compiles without errors
□ golden-page1.png committed as visual-regression baseline
□ lint_rules.json with template-specific checks
□ README.md with: when to use, required fields, example, workflow
□ Golden test passes
□ Stress tests pass (empty, max, malicious)
□ PDF/UA-1 passes (if accessibility enabled)
□ Brand kit compatible
□ Agent workflow test passes
□ Human visual review complete
```

### Appendix B — Accessibility review checklist

```text
□ Document title set via #set document(title: ...)
□ Heading hierarchy starts at level 1
□ No skipped heading levels
□ All images have alt text
□ All figures (charts, diagrams) have alt text
□ Color contrast ≥ 4.5:1 for body text
□ Tables use table element (not manual layout)
□ PDF/UA-1 export succeeds
□ Manual reading-order review
□ Manual screen-reader spot check (optional but recommended)
```

### Appendix C — Tool description template

```markdown
docforge_create_document

Creates a new document from a template and validated data payload.
Returns a document_id for use in compile, preview, lint, and export.

WHEN TO USE: After get_template_schema, when you have structured data ready.
WHEN NOT TO USE: Before reading the template schema.

REQUIRED: template_id, data (matching schema)
OPTIONAL: brand_id (default: "default"), options.accessibility (default: true)

RETURNS: document_id, status, missing_fields[], warnings[]

ON FAILURE: schema_error with agent_action describing which fields to fix.
Do not call compile_document until status is "created" with no missing required fields.

DOCUMENT HANDLE: document_id expires after 24h idle. Pass to all subsequent calls.
```

### Appendix D — Error type reference

| `error_type` | `retryable` | Typical `agent_action` |
|--------------|-------------|------------------------|
| `schema_error` | yes | Fix data fields per validation message |
| `template_error` | no | Report issue; try different template |
| `compile_error` | yes | Check data/template mismatch; try repair |
| `asset_error` | yes | Fix or remove asset reference |
| `layout_warning` | yes | Review preview; accept or repair |
| `accessibility_warning` | yes | Add alt text or fix heading hierarchy |
| `accessibility_error` | yes | Fix accessibility issues per message |
| `math_error` | yes | Simplify LaTeX or use plain text |
| `budget_error` | yes | Reduce content or split into appendix |
| `timeout_error` | yes | Simplify document; reduce charts/images |

### Appendix E — Research references

| Topic | Source |
|-------|--------|
| Typst automated generation | [Typst blog, Nov 2025](https://typst.app/blog/2025/automated-generation/) |
| Typst accessibility | [Accessibility guide](https://typst.app/docs/guides/accessibility/) |
| Typst PDF standards | [PDF reference](https://typst.app/docs/reference/pdf/) |
| Typst 0.14 tagged PDF | [Release blog](https://typst.app/blog/2025/typst-0.14/) |
| MiTeX LaTeX math | [Typst Universe](https://typst.app/universe/package/mitex/) |
| MCP tool design | [Phil Schmid](https://www.philschmid.de/mcp-best-practices), [WorkOS](https://workos.com/blog/designing-mcp-server-from-rest-api), [Speakeasy](https://www.speakeasy.com/mcp/tool-design) |
| MCP stateless handles | [SEP-2567](https://modelcontextprotocol.io/seps/2567-sessionless-mcp) |
| MCP async tasks | [Tasks extension](https://modelcontextprotocol.io/extensions/tasks/overview) |
| Structured outputs for agents | [Agent patterns](https://github.com/agentpatternscatalog/patterns/blob/ad774f5fce1844c2816f6ffabe0bf1647d6f9177/patterns/structured-output.md) |
| JSON Schema contracts | [OpenAPI 3.1](https://swagger.io/specification/) |
| Golden file PDF testing | [Approval tests pattern](https://principal-it.eu/2021/10/approval-tests_for_pdf_document_generation/) |
| Business template precedent | [typst-business-templates](https://github.com/casoon/typst-business-templates) |
| Typst query for lint | [Query docs](https://typst.app/docs/reference/introspection/query/) |
| PDF accessibility in production | [typst-in-production.com](https://typst-in-production.com/pdf-accessibility/) |

---

### Appendix F — Verified Typst CLI facts (primary sources)

| Fact | Source |
|------|--------|
| Default export is PDF | [PDF docs](https://typst.app/docs/reference/pdf/) |
| Tagged PDF on by default; `--no-pdf-tags` disables | [PDF docs](https://typst.app/docs/reference/pdf/) |
| `--pdf-standard` accepts `ua-1`, `a-2a`, etc. (comma-separated) | [PDF docs](https://typst.app/docs/reference/pdf/) |
| PDF/UA and PDF/A cannot be combined in one export | [PDF docs](https://typst.app/docs/reference/pdf/) |
| PNG via `--format png`, `--ppi`, `--pages`, multi-page `{p}` template | [PNG docs](https://typst.app/docs/reference/png/) |
| JSON via `json("file.json")` or `json(bytes(sys.inputs.key))` | [JSON docs](https://typst.app/docs/reference/data-loading/json), [automated generation blog](https://typst.app/blog/2025/automated-generation/) |
| `typst query` for post-compile introspection | [Query docs](https://typst.app/docs/reference/introspection/query/) |

### Appendix H — Complete scope registry (nothing skipped)

Every capability from the original brainstorm (`MAIN.MD`, retired v1.2) and this spec must land in a **wave**, a **Shadow mission**, or the **intentional exclusions** table below. Implementation order is Wave 0→7; planning all waves upfront prevents silent scope loss.

#### Shadow mission map

| Wave | Shadow mission ID | Name | Blocked by |
|------|-------------------|------|------------|
| — | M1 | DocForge Initiative | — |
| 0 | M2 | Wave 0 — Engine Proof | — |
| 1 | M3 | Wave 1 — Agent Contract | M2 |
| 2 | M4 | Wave 2 — Template Portfolio | M3 |
| 3 | M5 | Wave 3 — Brand + Accessibility | M4 |
| 4 | M6 | Wave 4 — Data + Visuals | M5 |
| 5 | M7 | Wave 5 — Repair + QA Automation | M6 |
| 6 | M8 | Wave 6 — Reporting Power | M7 |
| 7 | M9 | Wave 7 — Designer + Ecosystem | M8 |

Parent M1 completes only when M2–M9 all pass their **outcome contracts** (binary; no partial credit).

#### MCP tools → wave

| Tool | Wave | Notes |
|------|------|-------|
| `docforge_list_templates` | 1 | |
| `docforge_get_template_schema` | 1 | |
| `docforge_create_document` | 1 | |
| `docforge_compile_document` | 1 | async via MCP Tasks in 5 |
| `docforge_preview_document` | 1 | |
| `docforge_export_document` | 1 | |
| `docforge_lint_document` | 2 | |
| `docforge_destroy_document` | 2 | |
| `docforge_repair_document` | 5 | |
| MCP resources (templates, previews, PDF) | 2 | §12.3 |
| `upgrade_document_template` | 6 | |

#### Templates → wave (full portfolio)

| Template | Wave | Golden + stress |
|----------|------|-----------------|
| executive_memo | 0 v0, 1 v1, 2 polish | ✓ each promotion |
| sales_proposal | 2 | ✓ |
| research_report | 2 | ✓ |
| incident_report | 2 | ✓ |
| kpi_report | 2 | ✓ |
| monthly_metrics | 4 | ✓ |
| survey_report | 4 | ✓ |
| financial_snapshot | 4 | ✓ |
| postmortem | 6 | ✓ |
| project_status | 6 | ✓ |
| decision_record | 6 | ✓ |
| meeting_brief | 6 | ✓ |
| invoice / quote | 6 | ✓ |
| contract_summary | 6 | ✓ |
| risk_assessment | 7 | ✓ |
| cohort_analysis | 7 | ✓ |
| cv / resume | 7 | ✓ |
| client_intake_summary | 7 | ✓ |

**20 templates** at full portfolio (Wave 7 exit). Fewer before that is expected; none are deleted from the plan.

#### Cross-cutting concerns → wave

| Concern | Spec § | First wave | Ongoing |
|---------|--------|------------|---------|
| Schema-before-markup | P1, §8 | 0–1 | all |
| Structured errors + taxonomy | §13 | 0 subset, 1 v1, 5 full translation | |
| Agent skill | §12.4 | 1 | maintained |
| Brand kits | §10 | 3 | |
| PDF/UA-1 | §14.5 | 3 | |
| PDF/A-2a | §17 W6 | 6 | |
| Chart / diagram semantic API | §11 | 4 | |
| MiTeX math fragments | §8.3 | 2 | |
| Markdown fields | §8.2 | 4 | |
| CSV ingestion | §17 W4 | 4 | |
| Security sandbox | §15 | 0 basic, 1 MCP validation, 4 package allowlist | |
| Golden-file tests | §14.4 | 0 | per template |
| Fuzz / malicious inputs | §14.4, §9.4 | 0 one test, 2 per template | |
| Visual regression CI | §14.3 | 5 | |
| Three core workflows | §5 | 2 | |
| `packages/docforge/` shared Typst | MAIN §19 | 4 | |
| `examples/` directory | MAIN §19 | 7 | |

#### Intentional exclusions (not lost — rejected with reason)

| Item (from MAIN or early drafts) | Disposition |
|----------------------------------|-------------|
| Raw Typst as default agent path | Excluded §19; advanced snippets only Wave 6 |
| Poppler/MuPDF preview pipeline | Superseded by Typst native PNG (Appendix F) |
| “AI Business Report MCP” product rename | Positioning in §3; single product name DocForge |
| Arbitrary `@preview/*` packages | Security §15; allowlist only |
| typst-mcp feature parity | Not a goal §16 |
| Rust embed Typst `World` trait | Deferred past Wave 0; CLI first §6 |
| arXiv MCP papers as requirements | Background only; not normative |
| Hosted multi-tenant SaaS | Optional Wave 7; not required for MVP |

#### MAIN.MD retirement audit

| MAIN section | Preserved in DOCFORGE |
|--------------|----------------------|
| §1–5 Typst rationale, LLM problem, gap | §1–2, §16 |
| §6 Architecture | §6–7 |
| §7 Tools (unprefixed names) | §12 (`docforge_` prefix) |
| §8 Skill | §12.4 |
| §9–11 Templates, brand, charts | §9–11 |
| §12 Security | §15 + cross-cutting table above |
| §13 Reliability / errors | §13 |
| §14 Preview / layout QA | §14.3, Wave 5 |
| §15 V0–V3 phases | Expanded to Waves 0–7 §17 |
| §16 Wedge positioning | §3 |
| §17 Core workflows | §5, Wave 2 exit |
| §18 Traps | §19 |
| §19 Stack, repo, tests | Wave 0 layout, §14.4, Appendix H |
| §20–21 Hardened concept / verdict | §1, §3 |

---

### Appendix G — Claims we explicitly do not treat as proven

- Exact Typst Universe package count (marketing figures drift; use [universe.typst.app](https://typst.app/universe/) live).
- typst-mcp star count as a quality signal (popularity ≠ production readiness).
- “Nobody occupies this whitespace” as a market fact.
- Specific LLM Typst vs LaTeX capability rankings without benchmark.
- Wave duration estimates without a team size assumption.
- Automated layout overflow detection in Wave 5+ (feasible; not validated).
- MiTeX `mitext` for production document prose (upstream: in development).

---

## Document history

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-06-11 | Initial comprehensive specification |
| 1.1 | 2026-06-11 | Hardening pass: epistemic labels, primary-source corrections, softened competitive claims |
| 1.2 | 2026-06-11 | Absorbed repo layout from MAIN.MD; MAIN.MD retired as canonical spec lives here |
| 1.3 | 2026-06-11 | Appendix H scope registry + Shadow missions M1–M9 for Waves 0–7 |

---

*DocForge: Typst is the engine. Templates, schemas, and quality are the product.*
