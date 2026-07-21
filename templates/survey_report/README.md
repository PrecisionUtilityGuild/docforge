# Survey Report

**When to use:** Survey response breakdown with tables and bar charts.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Report headline |
| `period` | string | Survey period |
| `summary` | string | Executive summary |
| `questions` | array | `{ text, responses[{ label, count }] }` |
| `charts` | array | Chart API bar charts (typically one per question) |
| `commentary` | string | Key takeaways and recommendations |

## Optional fields

- `author`

## Agent workflow

1. Aggregate survey responses into `questions` and matching `charts` bar data
2. create → compile → lint → preview → export
