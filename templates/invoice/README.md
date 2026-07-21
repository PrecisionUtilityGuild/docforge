# Invoice

**When to use:** Professional invoice with calculated subtotal, tax, and total from line items.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Document title (typically "Invoice") |
| `invoice_number` | string | Invoice identifier |
| `client` | string | Client or billing entity |
| `date` | string | Invoice date |
| `due_date` | string | Payment due date |
| `line_items` | array | `{ description, quantity, unit_price }` |
| `tax_rate` | number | Tax percentage (e.g. 8.5 for 8.5%) |
| `payment_terms` | string | Payment instructions |

## Optional fields

- `typst_snippets.footer_note` — custom footer text (plain text, max 500 chars)

## Calculations

Subtotal, tax, and total are computed in `components.typ` from `line_items` and `tax_rate`. Do not supply totals in JSON.

## Agent workflow

1. `docforge_list_templates` → pick `invoice`
2. `docforge_get_template_schema` → read this schema
3. Structure billing data into line items with numeric quantities and unit prices
4. create → compile → lint → preview → export

## Example

See `sample.json` in this directory.
