# Architecture Decision Record

**When to use:** Document significant technical or architectural decisions for team alignment and future reference.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | ADR title (include number if used) |
| `status` | enum | proposed, accepted, deprecated |
| `date` | string | Decision date |
| `context` | string | Background and problem statement |
| `decision` | string | The decision made |
| `consequences` | string | Positive and negative outcomes |
| `alternatives` | array | `{ title, description }` options considered |

## Optional fields

- `typst_snippets.footer_note` — custom footer text (plain text, max 500 chars)

## Agent workflow

1. `docforge_list_templates` → pick `decision_record`
2. `docforge_get_template_schema` → read this schema
3. Structure meeting notes or design docs into ADR fields
4. create → compile → lint → preview → export

## Example

See `sample.json` in this directory.
