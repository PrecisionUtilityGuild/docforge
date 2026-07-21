# Blameless Postmortem

**When to use:** Structured blameless review after an incident, outage, or significant operational event.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Postmortem headline |
| `date` | string | Review date |
| `severity` | enum | low, medium, high, critical |
| `summary` | string | Executive summary |
| `timeline` | array | `{ time, event }` chronological events |
| `impact` | object | `{ duration, users_affected?, services? }` |
| `root_cause` | string | Root cause analysis |
| `what_went_well` | string[] | Positive observations |
| `what_went_wrong` | string[] | Improvement areas |
| `action_items` | array | `{ title, owner?, due?, status? }` follow-ups |
| `lessons_learned` | string[] | Takeaways for the organization |

## Optional fields

- `typst_snippets.footer_note` — custom footer text (plain text, max 500 chars)

## Agent workflow

1. `docforge_list_templates` → pick `postmortem`
2. `docforge_get_template_schema` → read this schema
3. Extract structured JSON from incident notes or transcripts
4. create → compile → lint → preview → export

## Example

See `sample.json` in this directory.
