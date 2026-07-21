# typstmcp — codebase notes for Claude

## What this is

Two products in one repo (see [README.md](./README.md) for the full picture):

- **DocForge** — an MCP server (stdio) for agent-driven PDF production via Typst.
  Engine spec: [DOCFORGE.md](./DOCFORGE.md). Entry point `src/index.ts` → `dist/index.js`.
- **Forge** — a Slack agent (Bolt) that drives DocForge **over MCP as a stdio child
  process**, not in-process (`src/forge/mcp-client.ts`; `FORGE_MCP=off` forces the
  in-process fallback). Product spec: [FORGE.md](./FORGE.md). Entry `dist/slack/app.js`.

Other docs: [AUDIT.md](./AUDIT.md) (security/correctness audit log),
[HARDENING.md](./HARDENING.md),
`.cursor/skills/docforge/SKILL.md` (agent-facing tool usage guide).

## Stack

- TypeScript, `strict`, **NodeNext ESM** — relative imports need the `.js` suffix.
- Node ≥ 20. Runtime deps: `@modelcontextprotocol/sdk`, `@slack/bolt`, `ajv`, `zod`.
- **Typst 0.14.2 pinned** (`TYPST_VERSION_PIN` in `src/config.ts`); the `typst` binary
  must be on PATH. `@preview` packages are vendored in `vendor/typst-packages/` so
  compiles need no network.
- vitest, eslint (flat config + typescript-eslint), prettier (enforced in CI-style
  via `format:check`).

## Commands (verified 2026-07-13)

```bash
npm run build          # rm -rf dist && tsc — clean
npm test               # vitest run — 73 files / 546 tests, ~10 s wall
npm run lint           # eslint — clean
npm run format:check   # prettier — clean (use `npm run format` to fix)
npm run check:typst    # asserts local typst matches the 0.14.2 pin
npm run check:packages # asserts vendored @preview packages present
```

Heavier gates (documented in README, **not** run during bootstrap):
`npm run release:qa` (full local release gate), `npm run test:visual` (golden-PNG
regression over 24 templates), `npm run forge:smoke`. Slack dev loop: `npm run slack`
(needs `.env` from `.env.sample` with bot + app tokens).

## Layout

- `src/` — engine (`compile/`, `templates/`, `validation/`, `qa/`, `repair/`, `lint/`,
  `sandbox/`, `security/`, `versioning/`), Slack agent (`slack/`), the Slack→engine
  bridge (`forge/`), transcript→template-data mappers (`workflow-mappers/`).
- `templates/<id>/` — 21 built-in Typst templates, each with `main.typ`,
  `components.typ`, `theme.typ`, a JSON schema/README/sample, and a
  `golden-page1.png` for visual regression. 3 more live in `marketplace/`.
- `tests/` — flat `*.test.ts` files, vitest `describe`/`it`, shared helpers in
  `tests/helpers.ts` (e.g. `templateDir()`). Tests import from `../src/**/*.js`
  (compiled-style specifiers, resolved by vitest).
- `scripts/*.mjs` — release/QA/dev tooling; syntax-checked by `npm run check:scripts`.

## Conventions & quirks

- Prettier is the formatter of record — run `npm run format` before committing;
  `format:check` covers src, tests, scripts, key markdown, and Slack manifests.
- Golden PNGs (`templates/*/golden-page1.png`) are committed binaries; template
  visual changes require regenerating them (`npm run compile:golden`).
- The package publishes `dist/` plus templates/vendor/docs (see `files` in
  package.json); `bin` is `docforge-mcp`.
- Docker image (Dockerfile) bundles Node 22 + pinned Typst for offline compiles.
