# Client Intake

**When to use:** Discovery intake capturing client context before a proposal or project kickoff.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Intake document title |
| `client` | string | Client organization name |
| `date` | string | Intake date |
| `contact` | object | `{ name?, email?, phone?, role? }` |
| `objectives` | array | Business objectives |
| `requirements` | array | Functional or technical requirements |
| `constraints` | array | Budget, timeline, or policy constraints |
| `next_steps` | array | Agreed follow-up actions |

## Optional fields

- `typst_snippets.footer_note` — custom footer text (plain text, max 500 chars)

## Agent workflow

1. `docforge_list_templates` → pick `client_intake`
2. `docforge_get_template_schema` → read this schema
3. Extract structured JSON from discovery notes (do not write Typst)
4. `docforge_create_document` → `docforge_compile_document` → `docforge_preview_document` → `docforge_export_document`

## Example

See `sample.json` in this directory.
