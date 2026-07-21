# Board One-Pager

**When to use:** Single-page board or leadership update with key metrics and asks.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Update title |
| `period` | string | Reporting period |
| `headline_metrics` | array | `{ label, value, trend }` where trend is `up`, `down`, or `flat` |
| `highlights` | array | Key accomplishments or developments |
| `asks` | array | `{ title, owner?, due? }` board decisions or introductions needed |

## Optional fields

- `typst_snippets.footer_note` — custom footer text (plain text, max 500 chars)

## Agent workflow

1. `docforge_list_templates` → pick `board_one_pager`
2. `docforge_get_template_schema` → read this schema
3. Extract structured JSON from leadership notes (do not write Typst)
4. `docforge_create_document` → `docforge_compile_document` → `docforge_preview_document` → `docforge_export_document`

## Example

See `sample.json` in this directory.
