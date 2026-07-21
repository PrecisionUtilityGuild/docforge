---
name: docforge
description: Agent workflow for DocForge MCP — schema-first PDF generation. Use when producing business PDFs via DocForge tools.
---

# DocForge Agent Skill

## Rules

1. **Never generate raw Typst** unless the user explicitly requests advanced mode.
2. **Always** follow: `docforge_list_templates` → `docforge_get_template_schema` → `docforge_create_document`.
3. Treat JSON data as the contract; validate against schema before calling create.
4. Use LaTeX only for math fragments in designated schema fields (`equations[].latex` in research_report).
5. **Always** `docforge_preview_document` before final delivery.
6. **Always** `docforge_lint_document` before `docforge_export_document`.
7. On compile failure: read `agent_action` and `suggested_repairs`, call `docforge_repair_document`, then recompile. Do not freestyle Typst fixes.
8. After compile, call `docforge_visual_qa_document` for layout issues lint may miss.
9. Use `docforge_generate_template_scaffold` + `docforge_register_custom_template` for custom templates.
8. When data is incomplete, ask for missing required fields — do not invent summary/risks without labeling assumptions.

## Workflow

```
list_templates → get_template_schema → create_document → compile_document
→ repair_document (if suggested_repairs) → compile_document
→ save_document_version (before major edits) → lint_document → preview_document
→ export_document → destroy_document (optional cleanup)
```

## Templates

| Template | Use case |
|----------|----------|
| `executive_memo` | Leadership/board memo |
| `sales_proposal` | Client proposal from discovery |
| `research_report` | Analytical report with citations appendix |
| `incident_report` | Post-incident from transcript |
| `kpi_report` | Board KPI update from CSV + notes |
| `postmortem` | Blameless incident review |
| `project_status` | Weekly status with RAG indicators |
| `decision_record` | ADR-style decision documentation |
| `meeting_brief` | Pre-meeting context doc |
| `invoice` | Line-item invoice with computed totals |
| `contract_summary` | Contract clause summary |

## MCP resources

- `docforge://templates` — catalog (built-in + marketplace)
- `docforge://marketplace` — community templates only
- `docforge://templates/{id}/readme` — agent README
- `docforge://templates/{id}/sample` — sample JSON

## PDF compliance

Use `options.pdf_standard: "ua-1"` with `accessibility: true` (default) for PDF/UA.  
Use `options.pdf_standard: "a-2a"` with `options.accessibility: false` for PDF/A — **never both standards in one export**.

Use `options.typst_snippets.footer_note` for constrained custom footer text only (plain text, no `#` commands).

## MCP server

```bash
npm run build && npm start
```

Requires `typst` CLI (0.14+) on PATH.
