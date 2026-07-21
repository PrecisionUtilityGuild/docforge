# Forge / DocForge — Full Audit

**Audit date:** 2026-06-12 · **HEAD:** `4eddb27` (working tree dirty) · **Auditor:** Claude (Opus 4.8)
**Scope:** Whole repo — DocForge engine, Forge Slack agent, security, deployment readiness, product positioning.

**Baseline established before findings (ground truth, not assumed):**

| Check | Result |
|-------|--------|
| `tsc --noEmit` | clean, 0 errors |
| `npm test` | **282 passed / 282** (25 files) |
| Typst | `0.14.2` present, matches pin |
| Node | `v22.22.0` |
| Secrets in git | none committed (only `xoxb-test` stubs in tests) |
| CI | present, pins Typst 0.14.2 + version/sync/visual gates |

The codebase is **functionally strong and well-tested**. This audit is about the gap between "tests pass" and "production-grade hosted deployment that survives on a locked-down remote box." Findings are ranked by what actually breaks in unattended hosted operation.

---

## ✅ Resolution status (all findings closed — 2026-06-12)

Every finding F1–F12 is fixed and verified. Suite grew **282 → 300 tests** (all passing); `tsc` clean; `npm run lint` + `format:check` clean.

| # | Fix | Verified by |
|---|-----|-------------|
| F1 | Vendored `@preview/{mitex,primaviz,cmarker}` into `vendor/typst-packages/`; `runTypst` passes `--package-path`; `check-vendored-packages.mjs` guards drift (CI) | **Proven offline:** package removed from cache + egress blocked (`HTTPS_PROXY=http://127.0.0.1:1`) → chart compile still produces PDF via the wired pipeline; control (no vendor) → `Connection refused` |
| F2 | `Dockerfile` (Node 22 + pinned Typst 0.14.2 + build + vendored pkgs + `dist/index.js` MCP child + `/health` + HTTP) + `.dockerignore` | Prod-dep audit: no `src/` import of a devDep; `@slack/web-api` is `import type` only → `npm ci --omit=dev` safe. (Docker daemon unavailable here, so image not built — logic verified by parts.) |
| F3 | `slack/manifest.http.json` (`socket_mode_enabled:false`, request URLs) | **Booted HTTP app:** `/health`→200, `/slack/events`→401 on unsigned POST (endpoint mounted, signature verification live) |
| F4 | `dedupeRedeliveries` global middleware drops `retryNum>0` + duplicate event/trigger ids | `tests/slack-dedupe.test.ts` (4) |
| F5 | `takePendingIncident/BoardPack/ProposalForConfirm` claim-on-read; confirm handlers claim *before* compile | `tests/slack-claim.test.ts` (3) |
| F6 | `assertSlackHost` pins `*.slack.com` + https before attaching bot token | `tests/slack-download.test.ts` — non-Slack host rejected, `fetch` never called |
| F7 | Content-Length precheck + streaming byte cap in `downloadSlackTextFile`; limits made lazy (`maxCsvAttachmentBytes()`) so runtime env applies | `tests/slack-download.test.ts` — oversized + lying-Content-Length both rejected |
| F8 | Removed `ANTHROPIC_API_KEY` + "LLM may refine" from docs; reframed as MCP + determinism | (docs) |
| F9 | `.gitignore` + `.dockerignore`: `.slack/`, `.residual-sessions/`, `*.sqlite` | — |
| F10 | Snippet validator denylist → allowlist (rejects `# $ \` < > \\ @`) | `tests/snippet-allowlist.test.ts` (5) — incl. the `#calc.fact()` the old denylist missed |
| F11 | ESLint 9 (flat) + Prettier + `lint`/`format:check` scripts + CI gates; fixed 14 real lint findings | `npm run lint` & `format:check` exit 0 |
| F12 | Download path now covered | `tests/slack-download.test.ts` (5) |

**Plus** the architecture resolution (prior turn): Slack agent drives DocForge over a real MCP stdio child (`src/forge/mcp-client.ts`), proven by `tests/forge-mcp-pipeline.test.ts`. CI gained vendored-package + lint + format checks.

**Deploy note (carried from F2):** container ships `dist/index.js` (the bot spawns it) and bot+server share `DOCFORGE_DATA_ROOT` (PDF path resolved by `document_id`).

---

## Resolved this session (2026-06-12)

- **Architecture / MCP story (was the open question behind F8):** The Slack agent now drives the DocForge MCP server over a stdio child process (`src/forge/mcp-client.ts`); `producePdf` routes create → compile → lint → export through real MCP tool calls, with the in-process path kept as a transport fallback (`FORGE_MCP=off` forces it). Proven by `tests/forge-mcp-pipeline.test.ts` (spawns the server, yields a real PDF, confirms the export tool returns the sanitized `output.pdf` basename). The compile tool was split: plain `docforge_compile_document` (bot path) + `docforge_compile_document_async` (task-based, for the MCP-Tasks operation) — because a plain `callTool` on the task tool returns *"No task store provided for task-capable tool."* (verified). **283/283 tests pass.**
- **F8 (AI fiction):** Removed `ANTHROPIC_API_KEY` from the documented deploy env and corrected the "LLM may refine" claim (FORGE.md §2). The integration surface is stated as **MCP server integration**; determinism is framed as the differentiator. No LLM — and the docs no longer pretend otherwise.
- **F9 (gitignore):** Added `.slack/`, `.residual-sessions/`, `*.sqlite`.

**Still open (unchanged, do not lose these):** F1 (offline packages), F2 (Dockerfile), F3 (HTTP manifest), F4 (event dedup), F5 (double-confirm race), F6 (download host pin), F7 (CSV cap on Slack path), F10 (snippet allowlist), F11 (linter), F12 (download test). The MCP work **adds** a small dependency to F2's deploy bundle: the container must ship `dist/index.js` (the bot spawns it) and the bot + server must share `DOCFORGE_DATA_ROOT` (the PDF path is resolved by `document_id` from that shared volume).

## Severity summary

| # | Finding | Severity | Area |
|---|---------|----------|------|
| F1 | Typst compile **requires network** to fetch `@preview/*` packages — contradicts "offline cache" non-negotiable; **breaks in a locked-down container** | **Critical** | Deploy / Security |
| F2 | **No Dockerfile / deploy artifact** despite the delivery plan requiring one for hosted operation | **Critical** | Deploy |
| F3 | Manifest is **socket-mode only**; unattended hosted operation requires HTTP (`socket_mode_enabled: false`) | **High** | Deploy |
| F4 | **No Slack event de-duplication** — Slack retries on 3s ack timeout; long compiles → duplicate PDFs | **High** | Correctness |
| F5 | **Double-confirm race** — `getPending` → long compile → `deletePending` *after* upload; double-click "Approve" produces two PDFs | **High** | Correctness / UX |
| F6 | Slack file download **does not validate `url_private_download` host**; bot token sent as `Authorization: Bearer` to an event-supplied URL (defense-in-depth — events are signature-verified) | **Medium** | Security |
| F7 | Slack CSV download path **skips `assertCsvSize`** — unbounded `.text()` into memory (DoS) | **Medium** | Security |
| F8 | **No LLM anywhere**, yet product copy said "agent / LLM may refine" and the deploy env required `ANTHROPIC_API_KEY` — reality/narrative mismatch | **Medium** | Positioning |
| F9 | `.slack/`, `.residual-sessions/`, `.env.sample` **not in `.gitignore`** — one `git add -A` from leaking CLI state | **Medium** | Security / Hygiene |
| F10 | `typst_snippets` validator is a **denylist**; `#calc.fact(99999)`-style compute injection passes (bounded only by timeout) | **Low** | Security |
| F11 | **No linter/formatter** (no ESLint/Prettier config) — an avoidably unpolished surface | **Low** | Polish |
| F12 | File-download path has **zero test coverage** | **Low** | Test gap |

---

## Critical findings

### F1 — Compile requires network for `@preview/*` packages (DOCFORGE.md §15 violated)

**Evidence.** Templates import remote packages:
- `templates/research_report/components.typ` → `@preview/mitex:0.2.7`
- `packages/docforge/charts.typ` → `@preview/primaviz:0.7.0`
- `packages/docforge/markdown.typ` → `@preview/cmarker:0.1.6`

`src/compile/typst.ts` runs `typst compile --root <workspace>` with **no offline package strategy** and no network isolation. The package cache only exists at `~/Library/Caches/typst/packages/preview/` (mitex, primaviz, cmarker) — Typst **fetched them from the network**. No vendored copy in-repo.

**Proven empirically (self-audit):** removed `primaviz` from the cache and compiled a `docforge/charts.typ` import with egress blocked (`HTTPS_PROXY=http://127.0.0.1:1`):
```
downloading @preview/primaviz:0.7.0
error: failed to download package (… Connection refused) → no PDF produced
```
Note: `--package-path <dir>` does **not** fix this — it *adds* a search path; Typst still falls back to the network/default cache for `@preview/*`. The fix must vendor packages into a path Typst treats as the source *and* block the network fallback (e.g. `--package-cache-path` pre-populated, plus container egress rules).

DOCFORGE.md §15 lists as a **non-negotiable**: *"No network access during compile (offline package cache)"* and *"Package allowlist only."* Neither is enforced. HARDENING.md already flags this as "Medium / unaddressed" — it is actually **Critical for hosted deploys** because:
- A container with no warm cache and egress restrictions gets **compile failures on first use** of any template that imports a package (research_report, all chart/markdown paths).
- The board-pack (`kpi_report`) and any charted template depend on `primaviz`.

**Fix.** Vendor the three pinned packages into the repo (e.g. `vendor/typst-packages/preview/...`) and pass `--package-path vendor/typst-packages` (or set `TYPST_PACKAGE_PATH`) in `runTypst`. Add a build/CI step that asserts the vendored versions match `template.json` pins. This simultaneously closes the "offline cache" and "allowlist only" gaps.

### F2 — No deployment artifact

`find . -name "Dockerfile*"` → none. The delivery plan explicitly required a container with Node 20+, Typst 0.14.2, build artifacts, and `GET /health`. The `/health` route exists in `src/slack/app.ts` (HTTP mode only), but there is nothing to actually deploy. Without F1 + F2 fixed, the "Deploy uptime 24h+" gate cannot be met.

**Fix.** Add a `Dockerfile` (Node 22 base, install pinned Typst, `npm ci && npm run build`, vendored packages from F1, `CMD node dist/slack/app.js`) and a smoke step. Wire `SLACK_SOCKET_MODE=false`.

---

## High findings

### F3 — Manifest is socket-mode only
`slack/manifest.json` has `socket_mode_enabled: true` and no `request_url`. Socket mode needs a live `slack run` / long-lived process with `SLACK_APP_TOKEN`; a laptop `slack run` is insufficient for unattended hosting, which requires HTTP (`POST /slack/events`). The code **supports** HTTP (`ExpressReceiver` branch in `app.ts`, `detectMode()` in `config.ts`) — only the manifest and deploy config are missing. Ship an HTTP manifest variant.

### F4 — No Slack event de-duplication
`grep` for `retry_num` / `x-slack-retry` / dedup → **nothing**. Slack redelivers an event if not acked within 3s, up to 3×. The workflows ack fast (Bolt auto-ack) but the *expensive* work (gather → compile → upload) runs after, and `app_mention` handlers have no idempotency key. Two real consequences:
- A slow gather/compile that pushes the handler past 3s on the *first* `app_mention` can trigger a retry that starts a **second** workflow run.
- Combined with F5, this is the most likely way a user sees duplicate output.

**Fix.** Drop events whose `x-slack-retry-num` header is set (Bolt exposes it on the receiver), or keep a short-TTL `Set<event_ts>` and no-op on repeats.

### F5 — Double-confirm race produces two PDFs
In `src/slack/listeners/actions.ts`, every confirm handler does:
```
const pending = getPendingX(id);   // still present
... await compileAndUploadX(...)   // seconds of work
deletePendingX(id);                // only now removed
```
The pending entry is **not claimed before the await**. A user double-clicking "Approve" (likely — the button gives no disabled-state feedback while compiling) passes `getPendingX` twice → two compiles → two `files.uploadV2`. Also true if F4 fires.

**Fix.** Atomically claim-and-delete *before* compiling: `const pending = takePendingX(id); if (!pending) return;` where `takePendingX` deletes on read. Re-store only if you need it for an error path.

### F6 — Bot token sent to unvalidated download URL (defense-in-depth)
`src/slack/gather/files.ts`:
```ts
const url = file.url_private_download;   // from inbound event payload
await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
```
`url_private_download` originates in the event/`files.info` payload and is **never checked to be a `slack.com` host**.

**Self-audit correction (was "High").** I verified Bolt's `ExpressReceiver` runs with `signatureVerification = true` by default and `app.ts` passes `signingSecret`, so in HTTP mode only Slack-signed payloads reach this code — the URL is **Slack-originated, not arbitrary-attacker-controlled**. So this is *not* a drive-by token-exfil exploit. It remains worth fixing as defense-in-depth: the bot token should never ride on a request to a host you didn't pin (a malicious workspace member crafting a file object, or a future code path that forwards the URL, would otherwise leak it).

**Fix.** `const u = new URL(url); if (!u.hostname.endsWith(".slack.com")) throw`. One line.

---

## Medium findings

### F7 — CSV download is unbounded
`src/service.ts` calls `assertCsvSize` for the MCP `csv_attachment` path, but the **Slack** path (`gather/files.ts` → `response.text()` → `assessBoardCsv`) never does. `grep assertCsvSize src/slack` → none. A large attachment is pulled fully into memory. Enforce `MAX_CSV_ATTACHMENT_BYTES` against `Content-Length` and the body length before parsing.

### F8 — "Agent / LLM" narrative vs. deterministic reality
`grep` for `@anthropic`/`claude-agent-sdk`/`openai`/`generateText` across `src/` → **nothing**. Forge is keyword routing (`router.ts`) + deterministic helpers (`workflow-mappers/workflows.ts`). That is *more reliable* and defensible — but:
- product copy (FORGE.md §2) said *"LLM may refine after helper"* — it doesn't.
- deploy docs listed `ANTHROPIC_API_KEY` as a required env var that nothing reads.

Reviewers in "New Slack Agent" track will ask "where's the agent intelligence?" Either (a) **lean into determinism** as the differentiator ("schema-validated, no hallucinated money/KPIs — by construction") and drop the LLM/`ANTHROPIC_API_KEY` claims, or (b) add a genuine LLM refinement step (Claude via `@anthropic-ai/sdk`) on the *prose* fields only, never pricing/KPIs. Pick one; the current half-claim is the weakest spot for the pitch.

### F9 — gitignore gaps around Slack/CLI state
`.gitignore` covers `.env`/`.data` but **not** `.slack/`, `.residual-sessions/`, or `.env.sample`. `.slack/` currently holds only `config.json`/`hooks.json` (no live tokens *today*), but Slack CLI writes auth there; one `git add -A` leaks it. Add `.slack/`, `.residual-sessions/`, `*.sqlite` to `.gitignore`. (`.env.sample` is intentionally committed — keep, but confirm it has placeholders only.)

---

## Low findings

### F10 — Snippet validator is a leaky denylist
`src/validation/typst-snippets.ts` blocks `#import`/`#let`/`#set`/`read(`/`eval`… but a snippet is still spliced into Typst markup. `#calc.fact(99999)` or deeply nested content matches no forbidden pattern → compute/blowup bounded only by the 30s timeout. Opt-in advanced path + timeout makes this Low, but prefer an **allowlist** (plain text + a fixed set of escaped inline marks) over chasing denylist holes.

### F11 — No linter/formatter
No ESLint/Prettier config. For a "looks amateurish" brief this is the concrete lever: add `eslint` + `@typescript-eslint` + `prettier`, a `lint` script, and a CI step. Cheap, visible polish.

### F12 — File-download path untested
`grep downloadSlackTextFile tests/` → none. The one network-touching Slack helper (and the F6/F7 surface) has no test. Add a mocked-`fetch` test covering host rejection + size cap once F6/F7 land.

---

## What is genuinely good (so the report isn't one-sided)

- **Test discipline:** 282 tests incl. fuzz (60), stress (40), golden (20), per-wave suites. Real coverage of templates and edge inputs.
- **CI:** pins Typst, runs version + schema/sample sync + visual regression gates.
- **Diagnostics hygiene:** `sanitizeHostPaths` + `sanitizeDiagnostics` strip host paths from agent-facing output; export returns basenames only.
- **Path safety:** `assertSafeId` + `resolvePathInAllowedRoots` (realpath-based) on template/brand/custom-template I/O.
- **Concurrency on compile:** `compileInFlight` map dedups concurrent compiles per `document_id` (note: this is the *engine* layer — it does **not** save the Slack layer from F4/F5, which race *before* reaching it).
- **Document handles:** `randomUUID`-derived (64-bit), TTL-enforced, expiry diagnostics.
- **Guardrails that hold:** pricing/KPIs come only from user input; summarize returns text-only (no PDF); confirm-before-export is real.

---

## Recommended fix order (highest delivery ROI first)

1. **F1 + F2 + F3** (deploy bundle): vendor packages offline, Dockerfile, HTTP manifest. Without these the app can't survive a locked-down hosted environment. *(~half a day)*
2. **F4 + F5** (dedup + claim-before-compile): kills duplicate-PDF, the most visible live defect. *(~1–2h)*
3. **F6 + F7** (host pin + CSV cap): two-line security wins. *(~30m)*
4. **F8** (pick a positioning story; drop or implement the LLM claim). *(decision, then ~2h if implementing)*
5. **F9, F11** (gitignore, lint/format): polish. *(~1h)*
6. **F10, F12** (snippet allowlist, download test): hardening backlog.

---

## Self-audit (audit of the audit, as requested)

Every finding was re-checked against the code; corrections below.

**Corrected (avoided false positives):**
- **F6 downgraded High → Medium.** I initially framed it as live token exfil. Verified `ExpressReceiver` defaults `signatureVerification = true` and `app.ts` supplies `signingSecret` → only Slack-signed payloads reach the handler, so the URL is Slack-originated. Real residual risk is defense-in-depth, not drive-by. Framing fixed in F6.
- **F1 mechanism corrected.** First offline test "passed" because the default cache was still warm and `--package-path` only *adds* a path. Re-tested with the package removed **and** egress blocked → confirmed hard failure. F1 stands, with the exact repro and a corrected fix (don't rely on `--package-path` alone).

**Re-verified true (not false positives):**
- **F4 (no dedup):** `grep retry_num|x-slack-retry|dedup src/` → zero hits. Real.
- **F5 (delete-after-await):** read all three confirm handlers — `getPending` (L62/103/144) → `await compileAndUpload` (L87/128/169) → `deletePending` (L92/133/174). No `takePending`/claim-on-read exists. Real.
- **F8 (no LLM):** `grep anthropic|openai|claude-agent|generateText|messages.create` across `src/` **and** `scripts/` → zero; not in `package.json` deps. Real. (The differentiator framing in F8 is a recommendation, not a defect claim.)
- **F3 (socket-only manifest):** searched all `manifest*.json` — only one, `socket_mode_enabled: true`, no `request_url`. Real.
- **F7 (CSV cap skipped in Slack path):** `grep assertCsvSize src/slack` → none; engine path does call it. Real asymmetry.

**Deliberately NOT flagged (checked, found adequate — avoiding false negatives *and* false alarms):**
- Engine-level compile concurrency (`compileInFlight`) — correct; only noted that it doesn't cover the Slack-layer races (F4/F5), which happen earlier.
- `document_id` unguessability — `randomUUID` 64-bit, fine; no finding.
- Host-path leakage to agents — `sanitizeDiagnostics`/`sanitizeHostPaths` cover the agent-facing surface; the raw `/private/var/...` in Typst stderr (seen in the F1 repro) is scrubbed by `parseTypstStderr` before return. No finding.
- Committed secrets — none; only `xoxb-test` stubs in tests. No finding (F9 is about *future* leakage via gitignore gaps, not a current leak).
- Path traversal on template/brand IDs — `assertSafeId` + realpath allowlisting hold. No finding.

**Confidence:** F1–F5, F7–F9, F11–F12 are high-confidence (code- or repro-verified). F6 and F10 are real but correctly scoped as lower severity. No finding in this report is speculative without a code citation.
