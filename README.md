# DocForge

Agent-grade document production MCP server powered by [Typst](https://typst.app/), plus **Forge** — a Slack agent for document workflows.

## Quick install (MCP)

Requires Node 20+ and Typst 0.14.2+ on PATH (`brew install typst` / [other platforms](https://github.com/typst/typst#installation)).

```json
{
  "mcpServers": {
    "docforge": {
      "command": "npx",
      "args": ["-y", "@precisionutilityguild/docforge"],
      "env": {
        "DOCFORGE_DATA_ROOT": "/absolute/path/for/your/documents"
      }
    }
  }
}
```

Set `DOCFORGE_DATA_ROOT` when installing via `npx` — the default stores documents inside the installed package directory, which under `npx` lives in a cache that can be pruned.

| Doc                          | Purpose                                                  |
| ---------------------------- | -------------------------------------------------------- |
| [DOCFORGE.md](./DOCFORGE.md) | DocForge engine specification                            |
| [FORGE.md](./FORGE.md)       | Forge product spec (workflows, architecture, guardrails) |
| [AUDIT.md](./AUDIT.md)       | Security / correctness / deploy audit + resolution log   |

## Requirements

- Node.js 20+
- [Typst](https://typst.app/) **0.14.2+** (pinned — `typst --version` must be ≥ `TYPST_VERSION_PIN` in `src/config.ts`)

## Setup

```bash
npm install
npm run build
npm run check:typst       # verify Typst pin (0.14.2)
npm run check:packages    # verify vendored offline @preview packages
npm run lint              # eslint
npm test                  # unit/integration tests
npm run release:qa        # full local release gate
npm run test:visual       # golden PNG regression (24 templates)
```

## Run Forge (Slack agent)

Requires [Slack CLI](https://docs.slack.dev/tools/slack-cli/) and a workspace.

```bash
cp .env.sample .env   # fill SLACK_BOT_TOKEN + SLACK_APP_TOKEN
npm run slack         # or: slack run
```

In Slack: `@forge help` lists Draft PDF plus the four curated document workflows (proposal, incident, board pack, status). Socket mode is default when `SLACK_APP_TOKEN` is set; HTTP mode uses `SLACK_SIGNING_SECRET` + `PORT` (includes `GET /health`).

- Socket-mode manifest (local dev): [`slack/manifest.json`](./slack/manifest.json)
- HTTP-mode manifest (deploy): [`slack/manifest.http.json`](./slack/manifest.http.json)

**The Slack agent drives DocForge over MCP**, not in-process: `producePdf` spawns the
MCP server (`dist/index.js`) as a stdio child and calls `docforge_*` tools
(`src/forge/mcp-client.ts`). Set `FORGE_MCP=off` to force the in-process fallback.

### Deploy (HTTP)

```bash
docker build -t forge .
docker run -p 3000:3000 \
  -e SLACK_SOCKET_MODE=false \
  -e SLACK_BOT_TOKEN \
  -e SLACK_SIGNING_SECRET \
  forge
```

The image ships Node 22, pinned Typst 0.14.2, the build, `dist/index.js` (the MCP
child), and `vendor/typst-packages/` so compiles work with **no network access**.

## Run MCP server (stdio)

```bash
npm start
```

### Cursor / MCP config example

```json
{
  "mcpServers": {
    "docforge": {
      "command": "node",
      "args": ["/absolute/path/to/typstmcp/dist/index.js"],
      "env": {
        "DOCFORGE_DATA_ROOT": "/absolute/path/to/typstmcp/.data/documents"
      }
    }
  }
}
```

## MCP tools (core workflow)

| Tool                              | Purpose                               |
| --------------------------------- | ------------------------------------- |
| `docforge_list_templates`         | Pick a template                       |
| `docforge_get_template_schema`    | JSON Schema + README + sample         |
| `docforge_create_document`        | Create document handle (24h idle TTL) |
| `docforge_compile_document`       | PDF + PNG previews (synchronous)      |
| `docforge_compile_document_async` | Same, via MCP Tasks (large docs)      |
| `docforge_repair_document`        | Deterministic data fixes              |
| `docforge_lint_document`          | Quality gate before export            |
| `docforge_preview_document`       | Base64 PNG previews for visual QA     |
| `docforge_visual_qa_document`     | Layout heuristics beyond lint         |
| `docforge_export_document`        | Final artifacts                       |
| `docforge_destroy_document`       | Cleanup                               |

Wave 6–7 also expose versioning, template upgrade, marketplace, custom template registration, brand extraction, and scaffold generation. See `.cursor/skills/docforge/SKILL.md`.

## MCP resources

- `docforge://templates` — built-in + marketplace catalog
- `docforge://marketplace` — community templates only
- `docforge://templates/{id}/readme` — agent README
- `docforge://templates/{id}/sample` — sample JSON

## Template catalog (24)

**Built-in (21):** `technical_note`, `executive_memo`, `sales_proposal`, `research_report`, `incident_report`, `kpi_report`, `monthly_metrics`, `survey_report`, `financial_snapshot`, `postmortem`, `project_status`, `decision_record`, `meeting_brief`, `invoice`, `contract_summary`, `cv`, `client_intake`, `risk_assessment`, `cohort_analysis`, `board_one_pager`, `compliance_memo`

**Marketplace (3):** `startup_pitch`, `nonprofit_report`, `tech_rfc`

## Forge Slack commands

- `@forge draft ...` — infer a safe DocForge template from pasted notes or thread context, then generate a reviewed PDF
- `@forge proposal for Northstar` — sales proposal from discovery context + user-supplied pricing
- `@forge incident report from #incident-api-gateway` — incident report from Slack timeline
- `@forge board pack for Q3 operating review` — KPI board pack from CSV
- `@forge status for #team-eng` — weekly RAG status report from a channel's activity (workstreams, blockers, next steps — grounded, not invented)

## PDF compliance options

- `options.pdf_standard: "ua-1"` — PDF/UA accessibility export (default `accessibility: true`)
- `options.pdf_standard: "a-2a"` — PDF/A archival (`accessibility: false` required; mutually exclusive with UA)

## Environment variables

| Variable                            | Default           | Purpose                                        |
| ----------------------------------- | ----------------- | ---------------------------------------------- |
| `DOCFORGE_DATA_ROOT`                | `.data/documents` | Document workspaces + custom templates         |
| `DOCFORGE_TYPST_PATH`               | `typst`           | Typst CLI binary                               |
| `DOCFORGE_TYPST_PACKAGE_PATH`       | `vendor/...`      | Offline Typst package source                   |
| `DOCFORGE_TYPST_PACKAGE_CACHE_PATH` | —                 | Typst package cache override                   |
| `DOCFORGE_COMPILE_TIMEOUT_MS`       | `30000`           | Compile timeout                                |
| `DOCFORGE_DOCUMENT_TTL_MS`          | `86400000`        | Idle document handle TTL (24h)                 |
| `DOCFORGE_TEMPLATE_SOURCE_DIRS`     | —                 | Extra allowed dirs for custom template sources |
| `DOCFORGE_MAX_DATA_BYTES`           | `5242880`         | Max document JSON payload                      |
| `DOCFORGE_MAX_CSV_BYTES`            | `1048576`         | Max Slack CSV attachment                       |
| `DOCFORGE_MAX_ASSET_BYTES`          | `10485760`        | Max uploaded/brand asset                       |
| `FORGE_MCP`                         | `on`              | Set `off` to force in-process PDF generation   |
| `FORGE_MCP_SERVER_ENTRY`            | `dist/index.js`   | Override MCP child entry                       |
| `SLACK_LOG_LEVEL`                   | `info`            | Set `debug` for Slack agent diagnostics        |
| `DOCFORGE_VISUAL_THRESHOLD`         | `0.02`            | Visual-regression diff threshold               |
| `TYPST_VERSION_PIN`                 | `0.14.2`          | Script-level Typst pin override                |
| `POLL_*`, `SEED_*`                  | see `.env.sample` | Local Slack poll/seed utility controls         |

## CI

GitHub Actions runs: checksum-verified Typst install → npm audit → Typst pin check →
template sync check → vendored-package check → lint + script syntax check → format
check → build → unit/integration tests → Forge smoke → visual regression → package
contents dry-run → Docker build. Golden drift fails CI; update with
`npm run compile:golden`.

For the full local release gate, run `npm run release:qa`. It executes the
offline CI-critical checks, verifies Slack manifest scopes/events, confirms the
npm package carries Slack setup/deploy assets, and scans tracked files for common
secret token patterns.
