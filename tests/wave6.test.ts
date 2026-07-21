import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { assertTypstAvailable } from "../src/compile/typst.js";
import {
  docforgeCompareDocumentVersions,
  docforgeCompileDocument,
  docforgeCreateDocument,
  docforgeRepairDocument,
  docforgeUpgradeDocumentTemplate,
  initService,
} from "../src/service.js";
import { getTemplateSample } from "../src/templates/registry.js";
import { validateTypstSnippets } from "../src/validation/typst-snippets.js";

let dataRoot = "";

function researchReportWithSources(count: number) {
  const sources = Array.from({ length: count }, (_, i) => ({
    citation: `Source ${i + 1}: Industry Report ${2020 + i}`,
    url: `https://example.com/source-${i + 1}`,
  }));
  return {
    title: "Multi-Source Research Report",
    author: "DocForge QA",
    date: "2026-06-11",
    abstract:
      "Analysis synthesizing multiple external references for Wave 6 citation appendix validation.",
    sections: [
      { title: "Overview", body: "This report cites ten independent sources in the appendix." },
      { title: "Methodology", body: "We reviewed primary literature and industry benchmarks." },
    ],
    findings: [
      {
        title: "Primary finding",
        summary: "Consistent trend across cited sources.",
        confidence: "high" as const,
      },
    ],
    sources,
  };
}

describe("Wave 6 — reporting power", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "docforge-wave6-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  it("research report with 10 sources compiles with citation appendix", async () => {
    const data = researchReportWithSources(10);
    const created = await docforgeCreateDocument({
      template_id: "research_report",
      data,
    });
    expect(created.status).toBe("created");
    const compiled = await docforgeCompileDocument(created.document_id);
    expect(compiled.success).toBe(true);
    expect(compiled.page_count).toBeGreaterThanOrEqual(2);
  });

  it("version comparison highlights changed sections", async () => {
    const sample = (await getTemplateSample("executive_memo")) as Record<string, unknown>;
    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data: sample,
    });

    await docforgeRepairDocument({
      document_id: created.document_id,
      repairs: ["truncate_string:sections[0].body:40"],
    });

    const diff = await docforgeCompareDocumentVersions({
      document_id: created.document_id,
      from_version: 1,
      to_version: 2,
    });
    expect(diff.success).toBe(true);
    expect(diff.section_changes?.length).toBeGreaterThan(0);
  });

  it("invoice line items calculate totals in compiled PDF", async () => {
    const sample = (await getTemplateSample("invoice")) as Record<string, unknown>;
    const items = sample.line_items as Array<{ quantity: number; unit_price: number }>;
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const tax = (subtotal * (sample.tax_rate as number)) / 100;
    const total = subtotal + tax;
    expect(total).toBeGreaterThan(0);

    const created = await docforgeCreateDocument({
      template_id: "invoice",
      data: sample,
    });
    const compiled = await docforgeCompileDocument(created.document_id);
    expect(compiled.success).toBe(true);
  });

  it("PDF/A-2a export succeeds for compliance mode", async () => {
    await assertTypstAvailable();
    const sample = await getTemplateSample("contract_summary");
    const created = await docforgeCreateDocument({
      template_id: "contract_summary",
      data: sample as Record<string, unknown>,
      options: { pdf_standard: "a-2a", accessibility: false },
    });
    const compiled = await docforgeCompileDocument(created.document_id);
    expect(compiled.success).toBe(true);
  });

  it("rejects forbidden typst snippets", () => {
    const result = validateTypstSnippets({ footer_note: "#import evil.typ" });
    expect(result.ok).toBe(false);
  });

  it("allows plain-text typst snippets via create_document", async () => {
    const sample = (await getTemplateSample("meeting_brief")) as Record<string, unknown>;
    const created = await docforgeCreateDocument({
      template_id: "meeting_brief",
      data: sample,
      options: { typst_snippets: { footer_note: "Internal — do not distribute" } },
    });
    expect(created.status).toBe("created");
    const compiled = await docforgeCompileDocument(created.document_id);
    expect(compiled.success).toBe(true);
  });

  it("upgrade_document_template refreshes template files", async () => {
    const sample = await getTemplateSample("decision_record");
    const created = await docforgeCreateDocument({
      template_id: "decision_record",
      data: sample as Record<string, unknown>,
    });
    const upgraded = await docforgeUpgradeDocumentTemplate({
      document_id: created.document_id,
    });
    expect(upgraded.success).toBe(true);
    expect(upgraded.template_version).toBeTruthy();
  });
});
