# Nonprofit Annual Report

**Author:** DocForge Community

**When to use:** Annual impact report for nonprofits with mission statement, metrics, program highlights, financial summary, and donor thank-you.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Report title |
| `organization` | string | Organization name |
| `year` | string | Reporting year |
| `mission` | string | Mission statement |
| `impact_metrics` | array | `{ label, value }` key outcomes |
| `programs` | array | `{ name, description }` program highlights |
| `financials` | object | `{ revenue, expenses }` annual totals |
| `thank_you` | string | Donor and volunteer acknowledgment |

## Optional fields

- `typst_snippets.footer_note` — custom footer text (plain text, max 500 chars)

## Agent workflow

1. `docforge_list_templates` → pick `nonprofit_report`
2. `docforge_get_template_schema` → read this schema
3. Extract structured JSON from annual report source material (do not write Typst)
4. `docforge_create_document` → `docforge_compile_document` → `docforge_preview_document` → `docforge_export_document`

## Example

See `sample.json` in this directory.
