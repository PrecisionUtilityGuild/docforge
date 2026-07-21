# Meeting Brief

**When to use:** Pre-meeting brief for leadership sessions, planning meetings, or client calls.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Meeting title |
| `date` | string | Meeting date |
| `attendees` | string[] | Participant list |
| `objective` | string | Meeting goal |
| `agenda` | array | `{ topic, duration }` agenda items |
| `prep_items` | string[] | Pre-read or preparation tasks |
| `background` | string | Context and stakes |

## Optional fields

- `typst_snippets.footer_note` — custom footer text (plain text, max 500 chars)

## Agent workflow

1. `docforge_list_templates` → pick `meeting_brief`
2. `docforge_get_template_schema` → read this schema
3. Structure calendar invite and notes into brief fields
4. create → compile → lint → preview → export

## Example

See `sample.json` in this directory.
