# Compliance Memo

**When to use:** Regulatory or policy compliance briefing with requirements and remediation actions.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Memo title |
| `regulation` | string | Regulation or standard name |
| `effective_date` | string | Effective or audit date |
| `summary` | string | Executive summary of compliance posture |
| `requirements` | array | Regulatory requirements to meet |
| `action_items` | array | `{ title, owner?, due?, status? }` remediation tasks |

Status values: `open`, `in_progress`, `done`.

## Optional fields

- `typst_snippets.footer_note` — custom footer text (plain text, max 500 chars)

## Agent workflow

1. `docforge_list_templates` → pick `compliance_memo`
2. `docforge_get_template_schema` → read this schema
3. Extract structured JSON from compliance notes (do not write Typst)
4. `docforge_create_document` → `docforge_compile_document` → `docforge_preview_document` → `docforge_export_document`

## Example

See `sample.json` in this directory.
