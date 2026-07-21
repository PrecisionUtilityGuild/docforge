# Risk Assessment

**When to use:** Structured risk register for projects, migrations, or operational reviews.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Assessment title |
| `scope` | string | Scope of the assessment |
| `assessment_date` | string | Date of assessment |
| `summary` | string | Executive summary of risk posture |
| `risks` | array | `{ id, description, likelihood, impact, mitigation, owner }` |

Likelihood and impact use `low`, `medium`, or `high`.

## Optional fields

- `typst_snippets.footer_note` — custom footer text (plain text, max 500 chars)

## Agent workflow

1. `docforge_list_templates` → pick `risk_assessment`
2. `docforge_get_template_schema` → read this schema
3. Extract structured JSON from risk notes (do not write Typst)
4. `docforge_create_document` → `docforge_compile_document` → `docforge_preview_document` → `docforge_export_document`

## Example

See `sample.json` in this directory.
