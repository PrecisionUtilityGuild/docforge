# Contract Summary

**When to use:** Executive summary of a contract, MSA, or agreement for legal review or stakeholder briefing.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Summary headline |
| `parties` | array | `{ name, role }` — at least two parties |
| `effective_date` | string | Contract effective date |
| `summary` | string | High-level overview |
| `clauses` | array | `{ title, body }` key clause summaries |
| `key_dates` | array | `{ label, date }` important milestones |

## Optional fields

- `typst_snippets.footer_note` — custom footer text (plain text, max 500 chars)

## Agent workflow

1. `docforge_list_templates` → pick `contract_summary`
2. `docforge_get_template_schema` → read this schema
3. Extract parties, clauses, and dates from contract text
4. create → compile → lint → preview → export

## Example

See `sample.json` in this directory.
