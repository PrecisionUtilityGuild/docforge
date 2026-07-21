# Project Status Report

**When to use:** Weekly or bi-weekly project status update for stakeholders and leadership.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Report headline |
| `period` | string | Reporting period (e.g. week range) |
| `author` | string | Author name |
| `overall_rag` | enum | red, amber, green — overall health |
| `summary` | string | Executive summary |
| `workstreams` | array | `{ name, status, rag, notes }` per stream |
| `blockers` | string[] | Current blockers (may be empty) |
| `next_steps` | string[] | Planned actions |

## Optional fields

- `evidence` — grounding ledger entries `{ type, source, quote, permalink? }` supporting RAG, blockers, and next steps
- `typst_snippets.footer_note` — custom footer text (plain text, max 500 chars)

## Agent workflow

1. `docforge_list_templates` → pick `project_status`
2. `docforge_get_template_schema` → read this schema
3. Structure status notes into workstreams and RAG indicators
4. Preserve source snippets in `evidence` so stakeholders can audit why the status says red/amber/green
5. create → compile → lint → preview → export

## Example

See `sample.json` in this directory.
