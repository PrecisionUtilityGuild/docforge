import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildEditModal, applyEditValues, EDIT_MODAL_CALLBACK } from "../src/slack/confirm/edit.js";
import { markTitleDraft } from "../src/slack/confirm/draft.js";
import { transcriptToIncidentReport } from "../src/workflow-mappers/workflows.js";
import { loadSchema, validateData } from "../src/validation/schema.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type Block = { block_id?: string; element?: { initial_value?: string; multiline?: boolean } };

const incidentDraft = {
  title: "DRAFT — Production Incident Report",
  severity: "medium",
  summary: "API errors spiking.",
  root_cause: "Connection pool exhaustion",
  // grounded/structured data that must never be exposed to hand-editing:
  timeline: [{ time: "16:10", event: "errors spiking" }],
  impact: { duration: "20 minutes", services: ["api-gateway"] },
};

describe("edit modal pre-fill", () => {
  it("strips the DRAFT prefix so the editor sees the clean title", () => {
    const view = buildEditModal({
      finalizeId: "fin-1",
      workflow: "incident",
      draftData: incidentDraft,
    });
    expect(view.callback_id).toBe(EDIT_MODAL_CALLBACK);
    expect(view.private_metadata).toBe("fin-1");
    const titleBlock = (view.blocks as Block[]).find((b) => b.block_id === "edit_title");
    expect(titleBlock?.element?.initial_value).toBe("Production Incident Report");
  });

  it("does NOT expose structured/grounded fields (timeline, impact) for editing", () => {
    const view = buildEditModal({
      finalizeId: "fin-1",
      workflow: "incident",
      draftData: incidentDraft,
    });
    const ids = (view.blocks as Block[]).map((b) => b.block_id);
    expect(ids).not.toContain("edit_timeline");
    expect(ids).not.toContain("edit_impact");
  });

  it("exposes existing safe scalar fields for inferred draft documents", () => {
    const view = buildEditModal({
      finalizeId: "fin-1",
      workflow: "draft",
      draftData: {
        title: "DRAFT — Transformer Notes",
        summary: "Short attention note.",
        body_md: "Attention maps query/key similarity.",
        equations: [{ label: "Score", latex: "QK^T" }],
        references: [{ citation: "Source", url: "https://example.com" }],
      },
    });

    const ids = (view.blocks as Block[]).map((b) => b.block_id);
    expect(ids).toContain("edit_title");
    expect(ids).toContain("edit_summary");
    expect(ids).toContain("edit_body_md");
    expect(ids).not.toContain("edit_equations");
    expect(ids).not.toContain("edit_references");

    const bodyBlock = (view.blocks as Block[]).find((b) => b.block_id === "edit_body_md");
    expect(bodyBlock?.element?.multiline).toBe(true);
  });
});

describe("applying edits", () => {
  const values = (v: Record<string, string>) =>
    Object.fromEntries(Object.entries(v).map(([k, val]) => [k, { value: { value: val } }]));

  it("applies edited fields and preserves grounded data byte-for-byte", () => {
    const out = applyEditValues({
      workflow: "incident",
      draftData: incidentDraft,
      values: values({
        edit_title: "Payment Incident",
        edit_severity: "high",
        edit_summary: "Checkout failures.",
        edit_root_cause: "Bad deploy",
      }),
    });
    expect(out.title).toBe("Payment Incident");
    expect(out.severity).toBe("high");
    expect(out.summary).toBe("Checkout failures.");
    // Grounded data untouched:
    expect(out.timeline).toEqual(incidentDraft.timeline);
    expect(out.impact).toEqual(incidentDraft.impact);
  });

  it("clearing an optional field removes it (so the schema sees it as absent)", () => {
    const out = applyEditValues({
      workflow: "incident",
      draftData: incidentDraft,
      values: values({ edit_root_cause: "   " }),
    });
    expect(out).not.toHaveProperty("root_cause");
  });

  it("ignores fields not submitted in the modal state", () => {
    const out = applyEditValues({
      workflow: "incident",
      draftData: incidentDraft,
      values: values({ edit_title: "New Title" }),
    });
    expect(out.title).toBe("New Title");
    expect(out.summary).toBe(incidentDraft.summary); // unchanged
  });

  it("edited + re-marked data still passes the strict incident schema", async () => {
    // The edit path must never produce schema-invalid data (same failure class
    // as the earlier finalize `status` bug).
    const base = transcriptToIncidentReport(
      "14:02 api-gateway error rate spiking\n14:40 rollback, all clear",
    );
    const edited = applyEditValues({
      workflow: "incident",
      draftData: base,
      values: values({ edit_title: "Edited Incident", edit_severity: "high" }),
    });
    const draft = markTitleDraft(edited);
    const schema = await loadSchema(path.join(repoRoot, "templates", "incident_report"));
    const result = validateData(schema, draft);
    if (!result.ok) throw new Error(result.diagnostic.message);
    expect(result.ok).toBe(true);
  });

  it("applies draft text edits while preserving structured arrays", async () => {
    const base = markTitleDraft({
      title: "Transformer Notes",
      author: "Forge",
      date: "2026-06-15",
      summary: "Short attention note.",
      body_md: "Attention maps query/key similarity.",
      equations: [{ label: "Score", latex: "QK^T", alt: "Attention score" }],
      references: [{ citation: "Source", url: "https://example.com" }],
    });

    const edited = applyEditValues({
      workflow: "draft",
      draftData: base,
      values: values({
        edit_title: "Edited Transformer Notes",
        edit_summary: "Updated summary.",
        edit_body_md: "Updated body text.",
        edit_equations: "should be ignored",
      }),
    });

    expect(edited.title).toBe("Edited Transformer Notes");
    expect(edited.summary).toBe("Updated summary.");
    expect(edited.body_md).toBe("Updated body text.");
    expect(edited.equations).toEqual(base.equations);
    expect(edited.references).toEqual(base.references);

    const schema = await loadSchema(path.join(repoRoot, "templates", "technical_note"));
    const draft = markTitleDraft(edited);
    const result = validateData(schema, draft);
    if (!result.ok) throw new Error(result.diagnostic.message);
    expect(result.ok).toBe(true);
  });
});
