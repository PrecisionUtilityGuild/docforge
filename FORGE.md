# Forge — product & implementation spec

**Status:** Spec grounded in `typstmcp` v0.7.0 codebase (June 2026).  
**Engine:** DocForge — [DOCFORGE.md](./DOCFORGE.md)

---

## 1. What we're building

**Forge** is a Slack agent in **this repo** that completes **document workflows**. Slack supplies messy context; DocForge produces schema-validated PDFs.

This is **not** chat compression. Each workflow maps to a template and lint gate; the curated workflows (proposal, incident, board, status) have grounding helpers **already tested**, and the open-ended **Draft PDF** infers one of five safe templates from pasted notes (`tests/draft-inference.test.ts`).

| User intent                      | Template               | Code helper                        | Test                      |
| -------------------------------- | ---------------------- | ---------------------------------- | ------------------------- |
| `proposal for Northstar`         | `sales_proposal`       | `discoveryToSalesProposal()`       | `workflow-e2e.test.ts`    |
| `incident report` / `postmortem` | `incident_report`      | `transcriptToIncidentReport()`     | `workflow-e2e.test.ts`    |
| `board pack`                     | `kpi_report`           | `csvAndNotesToKpiReport()`         | `workflow-e2e.test.ts`    |
| `status for #channel`            | `project_status`       | `transcriptLinesToProjectStatus()` | `status-mapper.test.ts`   |
| `draft <notes>` / `make a pdf`   | inferred (5 templates) | `inferDraftDocument()`             | `draft-inference.test.ts` |

> **Important:** Use `incident_report`, not `postmortem`, for v1.  
> `transcriptToIncidentReport()` targets `incident_report` schema (`actions`, not `action_items`).  
> `postmortem` requires `what_went_well`, `what_went_wrong`, `lessons_learned` — **no helper exists yet**.

---

## 2. Verified codebase facts (do not assume otherwise)

### DocForge API (`src/service.ts`)

Call `initService()` once at process startup (runs Typst pin check).

| Function                                                             | Returns / notes                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `docforgeCreateDocument({ template_id, data, brand_id?, options? })` | `{ status: "created" \| "failed", document_id?, missing_fields?, diagnostic? }` |
| `docforgeCompileDocument(document_id)`                               | `{ success, suggested_repairs?, diagnostic? }` — deduped if concurrent          |
| `docforgeLintDocument(document_id)`                                  | `{ success, issues, suggested_repairs? }`                                       |
| `docforgeExportDocument({ document_id, formats: ["pdf"] })`          | `{ success, exports: { pdf: "output.pdf" } }` — **basename only**               |
| `docforgeDestroyDocument(document_id)`                               | Cleanup after upload                                                            |

**PDF absolute path after compile:**

```text
${DOCDATA_ROOT}/${document_id}/output.pdf
```

`DocumentRecord.workspace_path` and `artifacts.pdf` (full path) are set on successful compile (`src/compile/typst.ts` → `output.pdf`).

### `csv_attachment` trap

`docforgeCreateDocument({ csv_attachment })` only works for template `monthly_metrics`.  
**Board pack must use** `csvAndNotesToKpiReport(csv, notes)` → pass resulting JSON to `create` with `template_id: "kpi_report"`.

### Workflow helpers (`src/workflow-mappers/workflows.ts`)

Already exported from `service.ts`:

- `csvAndNotesToKpiReport(csv, notes)` — validates against `kpi_report` schema in tests
- `transcriptToIncidentReport(transcript)` — validates against `incident_report` schema
- `discoveryToSalesProposal(transcript, requirements, pricingRows)` — validates against `sales_proposal` schema

**Strategy:** Helpers produce **schema-valid baseline JSON** deterministically — no LLM in the loop. Pricing rows and KPIs come from user input only, never from hardcoded defaults. This determinism is the differentiator: no hallucinated money or metrics, by construction. The Slack agent drives the DocForge MCP server (`src/forge/mcp-client.ts`), not in-process imports, on the live path.

### Existing E2E pattern (`tests/workflow-e2e.test.ts` → `fullWorkflow`)

This is the canonical DocForge pipeline to mirror in Forge:

```text
create → compile → lint → preview (optional) → export
```

`tests/hardening.test.ts` adds: repair if `suggested_repairs` → recompile → visual QA.

### MCP vs in-process

| Approach                                          | Role            | Implementation                                                              |
| ------------------------------------------------- | --------------- | --------------------------------------------------------------------------- |
| **MCP child process** (`src/forge/mcp-client.ts`) | Production path | Slack agent calls DocForge tools over stdio MCP                             |
| **In-process** (`import from service.js`)         | Fallback path   | Same service logic, used only when MCP transport is unavailable or disabled |

### Repo constraints

- **ESM only:** `"type": "module"`, `NodeNext` (`tsconfig.json`)
- **Node 20+**, **Typst 0.14.2+** pinned (`TYPST_VERSION_PIN` in `src/config.ts`)
- Slack runtime lives under `src/slack/`; Bolt is already wired in `package.json`

---

## 3. Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│ Slack (@forge / DM / assistant thread)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │ app_mention / message.im (+ action_token)
┌────────────────────────────▼────────────────────────────────────┐
│ src/slack/                                                       │
│  1. Intent router      (keyword → workflow id)                   │
│  2. Context gatherer   (RTS and/or conversations.* → transcript) │
│  3. Input collector    (pricing, CSV, confirmations)             │
│  4. Workflow mapper    (grounded helpers + draft inference)      │
│  5. Confirm UI         (Block Kit + preview before export)       │
│  6. Deliver            (files.uploadV2)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │ MCP stdio child (fallback: in-process)
┌────────────────────────────▼────────────────────────────────────┐
│ src/forge/pipeline.ts  ← create → compile → lint → export        │
│ src/service.ts         ← DocForge core                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                        Typst → output.pdf
```

---

## 4. Target file layout

```text
src/
├── forge/
│   ├── pipeline.ts       # producePdf(templateId, data) — mirrors workflow E2E
│   ├── workflows.ts      # WorkflowConfig registry (intent → template + helper)
│   └── types.ts
├── slack/
│   ├── app.ts            # Bolt App entry (HTTP prod / socket dev)
│   ├── listeners/
│   │   ├── app-mention.ts
│   │   ├── message.ts    # DM + confirm button actions
│   │   └── actions.ts    # Block Kit callbacks
│   ├── gather/
│   │   ├── rts.ts        # assistant.search.context + action_token
│   │   ├── history.ts    # conversations.history / replies (fallback)
│   │   ├── transcript.ts # messages[] → single transcript string
│   │   └── files.ts      # download CSV from Slack file_share
│   ├── deliver/
│   │   └── upload-pdf.ts # files.uploadV2, request_file_info: false
│   └── agent/
│       └── prompts.ts    # minimal — helpers do heavy lifting
├── service.ts            # unchanged core
└── mcp/server.ts         # unchanged; npm start for MCP operation

slack/
└── manifest.json         # from slack CLI, adapted for this repo

scripts/
├── seed-workspace.ts     # optional: post workflow context messages via API
└── forge-smoke.ts        # headless: 5 workflows → PDF paths
```

---

## 5. Workflows (implementation detail)

### W1 — Proposal (`sales_proposal`)

**Triggers:** `proposal`, `sow`, `quote for`, `proposal for {name}`

**Gather:**

1. Resolve channel: `#sales-{client}` from message or RTS search
2. **RTS** (with `action_token` from `app_mention`):
   ```json
   { "query": "discovery requirements scope Northstar", "content_types": ["messages"] }
   ```
3. **Fallback:** `conversations.history` on resolved channel (last 50 messages)
4. `transcript.ts` → single string
5. Parse `requirements` as newline-separated scope from RTS/history text
6. **Block until pricing:** user must paste table or structured lines in thread

**Map:**

```typescript
discoveryToSalesProposal(transcript, requirements, pricingRows);
// Override client.name from parsed intent / channel name
```

**Export label:** `Northstar-Proposal.pdf`

---

### W2 — Incident report (`incident_report`)

**Triggers:** `incident report`, `incident report from #channel`, `close out incident`  
(User may say "postmortem" — map to this workflow; output is incident report PDF.)

**Gather:**

1. Channel from `#incident-api-gateway` or current channel
2. Prefer `conversations.history` + `conversations.replies` for chronological accuracy
3. RTS optional supplement: `{ "query": "incident outage production", "after": <epoch> }`
4. `transcriptToIncidentReport(transcript)`
5. If `root_cause` in transcript is weak → Block Kit confirm or ask in thread
6. Prefix title with `DRAFT —` in data when root cause unconfirmed

**Export label:** `INC-042-Report.pdf`

---

### W3 — Board pack (`kpi_report`)

**Triggers:** `board pack`, `kpi report`, `board update`

**Gather:**

1. **Require CSV:** file attachment (`file_share` subtype) or fenced table in message
2. `files.ts` → download via `files.info` + `url_private_download`
3. Optional notes from same message or RTS on `#leadership`
4. `csvAndNotesToKpiReport(csv, notes)`

**Export label:** `Board-Pack-{period}.pdf`

---

## 6. Slack platform integration (researched)

### Scaffold source

Official path ([agent quickstart](https://docs.slack.dev/ai/agent-quickstart)):

```bash
slack create /tmp/forge-scaffold \
  --template slack-samples/bolt-js-starter-agent \
  --subdir claude-agent-sdk
```

Copy into this repo:

- `listeners/`, `agent/`, `manifest.json`, `.env.sample` → adapt under `src/slack/`
- Do **not** keep a separate repo

### Dev vs prod

| Mode            | When              | Config                                                                     |
| --------------- | ----------------- | -------------------------------------------------------------------------- |
| **Socket Mode** | Local `slack run` | `socketMode: true`, `SLACK_APP_TOKEN`                                      |
| **HTTP**        | Hosted deployment | `socket_mode_enabled: false`, `POST /slack/events`, `SLACK_SIGNING_SECRET` |

Bolt 4.7+ ([docs](https://docs.slack.dev/tools/bolt-js/concepts/adding-agent-features)):

- `setStatus({ status, loading_messages })` during compile
- `sayStream()` for progress text (not for binary PDF)
- `app_mention` + `message.im` handlers

### RTS (`assistant.search.context`)

- Bot token calls need **`action_token`** from triggering event ([RTS docs](https://docs.slack.dev/apis/web-api/real-time-search-api))
- Sources: `app_mention`, `message.im`, `message.mpim`, `message.groups`, `message.channels` (when mentioned)
- **Always implement history fallback** — RTS may be empty, workspace may lack semantic search

**Scopes (bot):** `app_mentions:read`, `chat:write`, `files:write`, `channels:history`, `groups:history`, `im:history`, `mpim:history`, `search:read.public`

### PDF upload

`files.upload` is **deprecated**. Use Web API v2:

```typescript
await client.files.uploadV2({
  channel_id,
  thread_ts,
  file: fs.createReadStream(pdfPath),
  filename: "proposal.pdf",
  initial_comment: "Proposal ready for review.",
  request_file_info: false, // avoids files:read scope
});
```

Scope: `files:write` only.

---

## 7. `src/forge/pipeline.ts` (build this first)

Extract before any Slack code. Gate: `npm run forge:smoke` passes.

```typescript
// Pseudocode — mirror tests/workflow-e2e.test.ts fullWorkflow + hardening repairs
export async function producePdf(
  templateId: string,
  data: Record<string, unknown>,
): Promise<{ documentId: string; pdfPath: string }> {
  await initService();
  const created = await docforgeCreateDocument({ template_id: templateId, data });
  if (created.status !== "created" || !created.document_id) {
    throw new ForgePipelineError(created.diagnostic);
  }
  const id = created.document_id;
  let compiled = await docforgeCompileDocument(id);
  if (!compiled.success) throw new ForgePipelineError(compiled);
  if (compiled.suggested_repairs?.length) {
    await docforgeRepairDocument({ document_id: id, repairs: compiled.suggested_repairs });
    compiled = await docforgeCompileDocument(id);
  }
  const lint = await docforgeLintDocument(id);
  if (!lint.success) throw new ForgePipelineError(lint);
  await docforgeExportDocument({ document_id: id, formats: ["pdf"] });
  const doc = await loadDocument(id);
  const pdfPath = doc?.artifacts.pdf;
  if (!pdfPath) throw new Error("PDF path missing after export");
  return { documentId: id, pdfPath };
}
```

`scripts/forge-smoke.mjs` calls the shipped workflow helpers/inference path → `producePdf` → verifies five non-empty PDFs exist.

---

## 8. Conversation flow

```text
@forge proposal for Northstar
  → setStatus("Gathering discovery from #sales-northstar…")
  → gather transcript
  → if !pricing: post "Paste pricing (lines: Description — $amount)" + wait
  → data = discoveryToSalesProposal(...)
  → post Block Kit summary (client, N scope items, total)
  → [Approve] → setStatus("Compiling PDF…") → producePdf → uploadV2 → destroy document
```

**Session state:** Store in-memory `Map<threadTs, PendingWorkflow>` — no DB for v1.

```typescript
type PendingWorkflow = {
  workflowId: "proposal" | "incident" | "board" | "status" | "draft";
  transcript?: string;
  csv?: string;
  pricingRows?: Array<{ item: string; amount: string }>;
  draftData?: Record<string, unknown>;
};
```

---

## 9. Guardrails

| Rule                | Implementation                                        |
| ------------------- | ----------------------------------------------------- |
| Pricing grounded    | `pricingRows` only from user messages; validate parse |
| KPIs grounded       | `csv` only from file/paste; `csvAndNotesToKpiReport`  |
| Root cause          | `DRAFT` prefix in `title` if not confirmed            |
| No PDF on summarize | Router returns early — text reply only                |
| Lint before upload  | `producePdf` throws if lint fails                     |
| Cleanup             | `docforgeDestroyDocument` after successful upload     |

---

## 10. Out of scope (v1)

- `postmortem` template (until `transcriptToPostmortem` exists)
- Direct named commands for every DocForge template
- `csv_attachment` on create (wrong template)
- Marketplace / Organizations track
- Storing Slack messages in external DB

---

## 11. Implementation order (with test gates)

| Step  | Deliverable                                           | Gate                                                  |
| ----- | ----------------------------------------------------- | ----------------------------------------------------- |
| **0** | `src/forge/pipeline.ts` + `npm run forge:smoke`       | 5 PDFs on disk from shipped workflows                 |
| **1** | `slack create` merged, `npm run slack`, `@forge help` | Bot online in workspace                               |
| **2** | W2 incident (history only, no RTS)                    | PDF in thread from production `#incident-api-gateway` |
| **3** | W1 proposal + pricing wait/confirm                    | Full confirm flow                                     |
| **4** | W3 board pack + CSV file                              | File download works                                   |
| **5** | W4 status + W5 draft                                  | status/draft PDFs gated in smoke + Slack E2E          |
| **6** | RTS on W1 + enrichment paths                          | action_token wired, history fallback preserved        |
| **7** | HTTP deploy + Typst in Docker                         | 24h uptime smoke                                      |
| **8** | Product docs + release checklist                      | Hosted workflow validated                             |

**Do not start Step 1 until Step 0 passes.** Slack integration on a broken pipeline wastes time.

---

## 12. Dependencies (as shipped)

```json
{
  "@slack/bolt": "^4.7.3",
  "@modelcontextprotocol/sdk": "^1.29.0"
}
```

No LLM SDK — Forge is deterministic (keyword routing + tested helpers) and drives
DocForge over MCP via `@modelcontextprotocol/sdk` (`src/forge/mcp-client.ts`).

Scripts (in `package.json`):

```json
{
  "slack": "npm run build && node --env-file=.env dist/slack/app.js",
  "forge:smoke": "npm run build && node scripts/forge-smoke.mjs",
  "test:visual": "node scripts/visual-regression.mjs",
  "compile:golden": "node scripts/compile-golden.mjs",
  "seed:workspace": "node --env-file=.env scripts/seed-workspace.mjs",
  "poll:slack": "node --env-file=.env scripts/poll-slack.mjs",
  "release:qa": "node scripts/release-qa.mjs"
}
```

---

## 13. Definition of done

- [x] `forge:smoke` produces 5 PDFs via helpers/inference + pipeline (no Slack)
- [x] `npm run release:qa` passes locally, including visual regression, Slack
      manifest validation, package inventory, and secret scan
- [x] Workspace seed/poll utilities are script-backed, test-covered,
      and executed against the sandbox Slack workspace
- [x] Project status hero workflow has live Slack PDF evidence from
      `#campaign-nto` with clean emoji handling and evidence ledger
- [ ] All 5 workflows work in workspace via `@forge` commands
- [ ] RTS used in ≥1 workflow; history fallback in all
- [ ] Confirm-before-export on all workflows
- [ ] Deployed HTTP app stays healthy under sustained uptime
- [ ] Product docs match actual behavior
