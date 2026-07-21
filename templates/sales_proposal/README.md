# Sales Proposal

**When to use:** Branded client proposal after discovery — scope, timeline, pricing, assumptions.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Proposal headline |
| `client` | object | `{ name, contact?, email? }` |
| `executive_summary` | string | One-paragraph value proposition |
| `scope` | array | `{ item, notes? }` deliverables |
| `timeline` | array | `{ phase, duration, deliverables? }` |
| `pricing` | object | `{ line_items[], subtotal?, total, terms? }` |

## Optional fields

- `assumptions`, `next_steps`, `discovery_notes`

## Agent workflow

1. `docforge_list_templates` → `sales_proposal`
2. `docforge_get_template_schema` → extract from discovery transcript/notes
3. `docforge_create_document` → compile → lint → preview → export

## Workflow

Map discovery call transcript + requirements list + pricing table into schema fields. Do not write Typst.
