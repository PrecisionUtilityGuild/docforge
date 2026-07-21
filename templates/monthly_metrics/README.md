# Monthly Metrics

**When to use:** CSV-driven monthly metrics dashboard with metric cards and charts.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Report headline |
| `period` | string | Reporting period (e.g. 2026-06) |
| `summary` | string | Executive summary |
| `metrics` | array | `{ name, value, unit?, target?, trend? }` |
| `charts` | array | Chart API objects (`bar`, `line`, `pie`, `kpi_card`, …) |
| `commentary` | string | Narrative analysis |

## Optional fields

- `author`

## Agent workflow

1. Parse CSV via `csvToMonthlyMetricsData(csv, title)` helper
2. create → compile → lint → preview → export

## Workflow

Upload a metrics CSV and pass the parsed JSON to `create_document` with template `monthly_metrics`.
