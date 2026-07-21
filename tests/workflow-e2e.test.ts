import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  csvAndNotesToKpiReport,
  discoveryToSalesProposal,
  docforgeCompileDocument,
  docforgeCreateDocument,
  docforgeDestroyDocument,
  docforgeExportDocument,
  docforgeLintDocument,
  docforgeListTemplates,
  docforgePreviewDocument,
  initService,
  transcriptToIncidentReport,
} from "../src/service.js";
import { loadSchema, validateData } from "../src/validation/schema.js";
import { TEMPLATE_IDS, templateDir } from "./helpers.js";

let dataRoot = "";

async function fullWorkflow(
  templateId: string,
  data: Record<string, unknown>,
): Promise<{ document_id: string; pdf: string }> {
  const created = await docforgeCreateDocument({ template_id: templateId, data });
  expect(created.status).toBe("created");

  const compiled = await docforgeCompileDocument(created.document_id);
  expect(compiled.success).toBe(true);

  const lint = await docforgeLintDocument(created.document_id);
  expect(lint.success).toBe(true);

  const preview = await docforgePreviewDocument({
    document_id: created.document_id,
    pages: [1],
  });
  expect(preview.success).toBe(true);

  const exported = await docforgeExportDocument({
    document_id: created.document_id,
    formats: ["pdf"],
  });
  expect(exported.success).toBe(true);
  expect(exported.exports?.pdf).toBeTruthy();

  return { document_id: created.document_id, pdf: exported.exports!.pdf! };
}

describe("Wave 2 workflow E2E", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "docforge-data-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  it("CSV + notes → board KPI update", async () => {
    const csv = `metric,value,target,trend
ARR,4200000,4000000,up
NRR,112%,110%,up
Churn,2.1%,3%,down`;

    const notes =
      "Founder notes: Enterprise pipeline up 34%. Need board approval for partner program budget. Automation beta on track for July.";

    const data = csvAndNotesToKpiReport(csv, notes);
    const schemaPayload = await loadSchema(templateDir("kpi_report"));
    expect(validateData(schemaPayload, data).ok).toBe(true);

    const { pdf } = await fullWorkflow("kpi_report", data);
    expect(pdf).toMatch(/output\.pdf$/);
  });

  it("transcript → incident report", async () => {
    const transcript = `14:02 Pager: api-gateway error rate 5.2%
14:08 @sre: opening incident bridge
14:18 Root cause likely connection pool after cache flush
14:35 Rollback deployed, errors dropping
14:49 All clear — critical path restored`;

    const data = transcriptToIncidentReport(transcript);
    const schemaPayload = await loadSchema(templateDir("incident_report"));
    expect(validateData(schemaPayload, data).ok).toBe(true);

    const { pdf } = await fullWorkflow("incident_report", data);
    expect(pdf).toMatch(/output\.pdf$/);
  });

  it("discovery notes → sales proposal", async () => {
    const transcript =
      "Client wants ERP integration, KPI dashboards, and admin training. Timeline target is 10 weeks. Budget discussed around $120k.";

    const requirements = `Inventory sync with analytics warehouse
Custom KPI templates for ops leadership
Training for internal BI team`;

    const pricing = [
      { item: "Solution engineering", amount: "$96000" },
      { item: "Project management", amount: "$12000" },
      { item: "Training", amount: "$8000" },
    ];

    const data = discoveryToSalesProposal(transcript, requirements, pricing);
    const schemaPayload = await loadSchema(templateDir("sales_proposal"));
    expect(validateData(schemaPayload, data).ok).toBe(true);

    const { pdf } = await fullWorkflow("sales_proposal", data);
    expect(pdf).toMatch(/output\.pdf$/);
  });
});

describe("Wave 2 MCP tools", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "docforge-data-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  it("lists all business templates", async () => {
    const { templates } = await docforgeListTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(TEMPLATE_IDS.length);
    for (const id of TEMPLATE_IDS) {
      expect(templates.some((t) => t.id === id)).toBe(true);
    }
  });

  it("lint catches TODO and empty sections", async () => {
    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data: {
        title: "Test Memo",
        summary: "Valid summary with enough words for the memo template lint rules to pass.",
        sections: [
          { title: "Filled", body: "Content here." },
          { title: "Empty", body: "" },
          { title: "TODO section", body: "TODO: replace before board meeting" },
        ],
      },
    });
    expect(created.status).toBe("created");

    await docforgeCompileDocument(created.document_id);
    const lint = await docforgeLintDocument(created.document_id);
    expect(lint.issues.some((i) => i.check === "todo_placeholders")).toBe(true);
    expect(lint.issues.some((i) => i.check === "empty_sections")).toBe(true);
  });

  it("destroy_document is idempotent", async () => {
    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data: {
        title: "Destroy test",
        summary: "Summary for destroy test memo document.",
        sections: [{ title: "One", body: "Body" }],
      },
    });
    const destroyed = await docforgeDestroyDocument(created.document_id);
    expect(destroyed.success).toBe(true);
    expect(destroyed.destroyed).toBe(true);

    const again = await docforgeDestroyDocument(created.document_id);
    expect(again.success).toBe(true);
  });
});
