# Technical RFC

**Author:** DocForge Community

**When to use:** Engineering request-for-comments document with status tracking, authors, motivation, detailed specification, alternatives analysis, and open questions.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | RFC title |
| `rfc_id` | string | Identifier (e.g. `RFC-0042`) |
| `status` | string | One of `draft`, `proposed`, `accepted`, `deprecated`, `superseded` |
| `authors` | array | Author names |
| `summary` | string | Executive summary |
| `motivation` | string | Why this change is needed |
| `specification` | string | Detailed technical specification |
| `alternatives` | array | `{ title, description }` options considered |
| `unresolved_questions` | array | Open questions for reviewers |

## Optional fields

- `typst_snippets.footer_note` — custom footer text (plain text, max 500 chars)

## Agent workflow

1. `docforge_list_templates` → pick `tech_rfc`
2. `docforge_get_template_schema` → read this schema
3. Extract structured JSON from RFC draft notes (do not write Typst)
4. `docforge_create_document` → `docforge_compile_document` → `docforge_preview_document` → `docforge_export_document`

## Example

See `sample.json` in this directory.
