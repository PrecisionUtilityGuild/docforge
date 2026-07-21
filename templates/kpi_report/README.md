# KPI Report

**When to use:** Board or leadership KPI update — metrics cards, trend commentary, risks, and asks.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Report headline |
| `period` | string | Reporting period (e.g. 2026-Q2) |
| `summary` | string | Executive summary |
| `kpis` | array | `{ name, value, unit?, target?, trend?, change? }` |
| `commentary` | string | Narrative analysis |

## Optional fields

- `charts` — `{ title, data_points[{ label, value }] }` simple bar table (full chart API in Wave 4)
- `risks`, `asks`, `author`

## Agent workflow

1. Merge CSV metrics + founder notes into schema JSON
2. create → compile → lint → preview → export

## Workflow

Use `csvAndNotesToKpiReport(csv, notes)` helper to build data from messy inputs.
