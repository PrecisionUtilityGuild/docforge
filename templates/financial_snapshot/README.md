# Financial Snapshot

**When to use:** P&L summary with line items, revenue/expense/net totals, and optional charts.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Report headline |
| `period` | string | Reporting period |
| `summary` | string | Executive summary |
| `line_items` | array | `{ category, amount }` P&L rows |
| `totals` | object | `{ revenue, expenses, net }` |
| `commentary` | string | Narrative analysis |

## Optional fields

- `author`
- `charts` — Chart API objects for revenue/expense breakdowns

## Agent workflow

1. Map ledger or spreadsheet rows into `line_items` and compute `totals`
2. create → compile → lint → preview → export
