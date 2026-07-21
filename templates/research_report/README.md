# Research Report

**When to use:** Long-form analytical report with abstract, structured sections, findings, and citations.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Report title |
| `abstract` | string | Executive abstract |
| `sections` | array | `{ title, body }` narrative sections |
| `findings` | array | `{ title, summary, confidence? }` key findings |

## Optional fields

- `equations` — `{ label, latex }` LaTeX math fragments rendered via MiTeX
- `sources` — `{ citation, url? }` bibliography entries
- `author`, `date`

## Math fields

Use LaTeX in `equations[].latex` only. Example: `"\\frac{a}{b}"`. Do not write Typst.

## Agent workflow

1. `docforge_get_template_schema` → map research notes into JSON
2. create → compile → lint → preview → export
