# Technical Note

**When to use:** Compact one-page technical notes assembled from Slack context, especially snippets with equations, bullet notes, and one or more references.

## Required fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Note title |
| `summary` | string | Short summary paragraph |
| `body_md` | string | Markdown body rendered safely |

## Optional fields

- `author`, `date` - header metadata
- `equations` - `{ label, latex, alt? }` LaTeX fragments rendered via MiTeX
- `references` - `{ citation, url? }` reference list

## Agent workflow

1. Choose `technical_note` for short technical Slack notes rather than long-form research reports.
2. Map source text into structured JSON only; do not generate Typst code.
3. Put LaTeX only in `equations[].latex`.
4. Use `docforge_create_document`, then compile and export.
