# Incident Report

**When to use:** Post-incident documentation from Slack threads, meeting transcripts, or on-call notes.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Incident headline |
| `severity` | enum | low, medium, high, critical |
| `summary` | string | What happened (1–2 paragraphs) |
| `timeline` | array | `{ time, event }` chronological events |
| `impact` | object | `{ duration, users_affected?, services? }` |
| `root_cause` | string | Root cause analysis |
| `actions` | array | `{ title, owner?, due?, status? }` follow-ups |

## Optional fields

- `incident_id`, `date`, `evidence`

## Agent workflow

1. Parse transcript/chat into timeline events and action items
2. create → compile → lint → preview → export

## Workflow

Feed meeting/Slack transcript to `transcriptToIncidentReport` helper, then create_document.
