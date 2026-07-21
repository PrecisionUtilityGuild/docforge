# Cohort Analysis

**When to use:** Retention cohort report for product or growth analytics reviews.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Report title |
| `period` | string | Reporting period |
| `cohorts` | array | `{ name, size, retention_rates[] }` — rates as percentages 0–100 |
| `insights` | array | Key takeaways |

## Optional fields

- `charts` — `{ type, title?, data[] }` trend visualizations (bar, line, pie, stacked_bar, kpi_card)
- `typst_snippets.footer_note` — custom footer text (plain text, max 500 chars)

## Agent workflow

1. `docforge_list_templates` → pick `cohort_analysis`
2. `docforge_get_template_schema` → read this schema
3. Extract structured JSON from analytics data (do not write Typst)
4. `docforge_create_document` → `docforge_compile_document` → `docforge_preview_document` → `docforge_export_document`

## Example

See `sample.json` in this directory.
