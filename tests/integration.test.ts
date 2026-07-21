import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  docforgeCompileDocument,
  docforgeCreateDocument,
  docforgeExportDocument,
  docforgeGetTemplateSchema,
  docforgeListTemplates,
  docforgePreviewDocument,
  initService,
  notesToExecutiveMemoData,
  runWorkflowSmoke,
} from "../src/service.js";
import { validateData } from "../src/validation/schema.js";
import { TEMPLATE_IDS } from "./helpers.js";

let dataRoot = "";

describe("Wave 1 agent workflow", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "docforge-data-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  it("lists templates and returns schema sufficient for sample validation", async () => {
    const { templates } = await docforgeListTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(TEMPLATE_IDS.length);
    expect(templates.some((t) => t.id === "executive_memo")).toBe(true);

    for (const id of TEMPLATE_IDS) {
      const schemaPayload = await docforgeGetTemplateSchema(id);
      expect(schemaPayload.schema).toBeTruthy();
      expect(schemaPayload.readme.length).toBeGreaterThan(20);
      const validation = validateData(schemaPayload.schema as object, schemaPayload.sample);
      expect(validation.ok).toBe(true);
    }
  });

  it("rejects invalid schema with agent_action", async () => {
    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data: { title: "Only title" },
    });
    expect(created.status).toBe("failed");
    expect(created.missing_fields?.length).toBeGreaterThan(0);
    expect(created.diagnostic?.error_type).toBe("schema_error");
    expect(created.diagnostic?.agent_action).toBeTruthy();
  });

  it("full workflow: create → compile → preview → export", async () => {
    const data = notesToExecutiveMemoData(
      "Founder notes: ARR hit 1.2M. Churn down. Need board approval for hiring plan.",
    );
    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data,
    });
    expect(created.status).toBe("created");

    const compiled = await docforgeCompileDocument(created.document_id);
    expect(compiled.success).toBe(true);
    expect(compiled.error_type).toBeUndefined();
    if (!compiled.success) return;
    expect(compiled.agent_action).toBeUndefined();

    const preview = await docforgePreviewDocument({
      document_id: created.document_id,
      pages: [1],
    });
    expect(preview.success).toBe(true);
    expect(preview.pages?.[0]?.base64?.length).toBeGreaterThan(100);

    const exported = await docforgeExportDocument({
      document_id: created.document_id,
      formats: ["pdf", "json"],
    });
    expect(exported.success).toBe(true);
    expect(exported.exports?.pdf).toBeTruthy();
  });

  it("compile failure returns structured diagnostics", async () => {
    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data: notesToExecutiveMemoData("Valid memo"),
    });
    expect(created.status).toBe("created");
    const compiled = await docforgeCompileDocument(created.document_id);
    expect(compiled.diagnostics?.[0]).toBeTruthy();
    if (!compiled.success) {
      expect(compiled.agent_action).toBeTruthy();
      expect(compiled.retryable).toBe(true);
    }
  });

  it("workflow smoke helper", async () => {
    const { pdf } = await runWorkflowSmoke();
    expect(pdf).toMatch(/output\.pdf$/);
  });
});
