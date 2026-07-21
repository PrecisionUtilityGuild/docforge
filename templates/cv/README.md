# CV / Resume

**When to use:** 1–3 page professional resume or curriculum vitae.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Full name (document title) |
| `title` | string | Professional headline |
| `contact` | object | `{ email?, phone?, location?, linkedin?, website? }` |
| `summary` | string | Professional summary paragraph |
| `experience` | array | `{ company, role, dates, bullets[] }` |
| `education` | array | `{ institution, degree, dates, details? }` |
| `skills` | array | Skill labels |

## Optional fields

- `typst_snippets.footer_note` — custom footer text (plain text, max 500 chars)

## Agent workflow

1. `docforge_list_templates` → pick `cv`
2. `docforge_get_template_schema` → read this schema
3. Extract structured JSON from user notes (do not write Typst)
4. `docforge_create_document` → `docforge_compile_document` → `docforge_preview_document` → `docforge_export_document`

## Example

See `sample.json` in this directory.
