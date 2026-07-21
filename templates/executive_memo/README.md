# Executive Memo

**When to use:** 1–5 page business update for leadership, board, or stakeholders.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Memo headline |
| `summary` | string | Executive summary (lead with outcome) |
| `sections` | array | `{ title, body }` content sections |

## Optional fields

- `author`, `date` — header metadata
- `risks` — `{ description, severity?, mitigation? }`
- `actions` — `{ title, owner?, due? }`

## Agent workflow

1. `docforge_list_templates` → pick `executive_memo`
2. `docforge_get_template_schema` → read this schema
3. Extract structured JSON from user notes (do not write Typst)
4. `docforge_create_document` → `docforge_compile_document` → `docforge_preview_document` → `docforge_export_document`

## Example

See `sample.json` in this directory.
