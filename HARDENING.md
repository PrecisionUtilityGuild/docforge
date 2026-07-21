# DocForge Hardening Pass (post-Wave 7)

> **Superseded — historical record.** This was the pre-Forge engine hardening pass.
> Current security/correctness/deploy status lives in [AUDIT.md](./AUDIT.md). Kept for
> provenance; do not treat as the present state.

Audit date: 2026-06-11 · HEAD: `1cb1ef8` · Spec: [DOCFORGE.md](./DOCFORGE.md) §14–15, §18

## Scope

Post-MVP hardening of security, correctness, agent UX, CI, and test coverage. No hosted multi-tenant SaaS scope.

## Audited areas

| Area | Files | Status |
|------|-------|--------|
| Path traversal / host path leakage | `src/security/paths.ts`, `src/errors.ts`, `src/compile/diagnostics.ts`, `src/service.ts` | Fixed |
| Custom template + brand registration | `src/templates/custom.ts`, `src/service.ts` | Fixed |
| Sandbox caps (timeout, data size, asset MIME) | `src/config.ts`, `src/security/limits.ts`, `src/compile/typst.ts` | Partial — compile timeout existed; added data/asset caps |
| MCP input validation | `src/mcp/server.ts`, `src/security/pdf-standard.ts` | Fixed |
| typst_snippets injection | `src/validation/typst-snippets.ts` | Existing + regression tests |
| Document TTL / stale handles | `src/documents/store.ts`, `src/service.ts` | Fixed |
| PDF/UA vs PDF/A mutual exclusivity | `src/security/pdf-standard.ts` | Fixed |
| Compile race (MCP Tasks) | `src/service.ts` | Fixed — per-document compile serialization |
| Typst version pin | `src/security/typst-version.ts`, `scripts/check-typst-version.mjs`, CI | Fixed |
| Agent workflow E2E | `tests/hardening.test.ts` | Added (3 templates) |
| Marketplace MCP resource | `src/mcp/server.ts` | Added `docforge://marketplace` |

## Fixes implemented

1. **`src/security/*`** — Path allowlisting, data/asset size limits, PDF standard validation, Typst version pin at startup.
2. **Custom templates** — `template_id` must match safe ID pattern; `source_path`/`output_path` resolved under allowed roots; destination cannot escape `custom-templates/`.
3. **Agent-facing responses** — Diagnostics sanitized (no host paths); preview drops `path` field; export returns workspace-relative artifact names (`output.pdf`).
4. **Document lifecycle** — Idle TTL enforced on tool access; expired handles return actionable diagnostics.
5. **Compile concurrency** — Concurrent compiles on the same `document_id` share one in-flight operation.
6. **Brand kit logos** — MIME sniff + size cap; path allowlisting; no path in error messages.
7. **CI** — Typst pin check + template schema/sample sync script before tests.

## Remaining risks (optional / out of scope)

| Item | Severity | Notes |
|------|----------|-------|
| Hosted multi-tenant runtime | N/A | Explicitly out of scope |
| Vision-assisted QA | Low | Previews enable multimodal agents; no built-in vision model |
| Embedded Typst `World` sandbox | Medium | Subprocess + `--root` used; Wave 0 noted embedded validation as future work |
| Offline package allowlist enforcement | Medium | Packages copied to workspace; arbitrary `@preview/*` not blocked at Typst CLI level |
| Error translation 90%+ corpus | Low | 28 mappings exist; expand with production stderr samples |
| Benchmark harness for &lt;5s compile | Low | Manual spot-check only this pass |
| Page budget enforcement at compile | Low | Lint warns; compile does not hard-stop |
| `source_zip` export format | Low | Declared in MCP schema but not implemented |

## Test commands

```bash
npm run build && npm test && npm run test:visual
node scripts/check-typst-version.mjs
node scripts/check-template-sync.mjs
```

## Updating golden previews

When intentional template layout changes occur:

1. Run `npm run compile:golden` locally with Typst `0.14.2`.
2. Review diff in `templates/*/golden-page1.png`.
3. Commit updated goldens; CI visual regression must pass at 100%.
