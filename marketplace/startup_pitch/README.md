# Startup Pitch

**Author:** DocForge Community

**When to use:** Single-page investor pitch summarizing problem, solution, market, traction, team, and funding ask.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Pitch title |
| `company` | string | Company name |
| `tagline` | string | One-line value proposition |
| `problem` | string | Market pain point |
| `solution` | string | Product or approach |
| `market` | string | TAM, segment, or growth thesis |
| `traction` | string | Key metrics and milestones |
| `team` | array | `{ name, role, bio? }` founding or leadership team |
| `ask` | object | `{ amount, use_of_funds? }` funding request |

## Optional fields

- `typst_snippets.footer_note` — custom footer text (plain text, max 500 chars)

## Agent workflow

1. `docforge_list_templates` → pick `startup_pitch`
2. `docforge_get_template_schema` → read this schema
3. Extract structured JSON from pitch notes (do not write Typst)
4. `docforge_create_document` → `docforge_compile_document` → `docforge_preview_document` → `docforge_export_document`

## Example

See `sample.json` in this directory.
