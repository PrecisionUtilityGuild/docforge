import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { validateCharts } from "../src/data/charts.js";
import {
  csvToMonthlyMetricsData,
  docforgeCompileDocument,
  docforgeCreateDocument,
  docforgeExportDocument,
  initService,
} from "../src/service.js";
import { getTemplateSample } from "../src/templates/registry.js";

let dataRoot = "";

describe("Wave 4 — charts, diagrams, CSV, markdown", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "docforge-w4-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  it("rejects unsupported chart types at create time", async () => {
    const sample = (await getTemplateSample("kpi_report")) as Record<string, unknown>;
    const data = {
      ...sample,
      charts: [{ type: "radar", data: [{ label: "A", value: 1 }] }],
    };
    const created = await docforgeCreateDocument({ template_id: "kpi_report", data });
    expect(created.status).toBe("failed");
    expect(created.diagnostic?.error_type).toBe("schema_error");
    expect(created.diagnostic?.message).toContain("radar");
  });

  it("validateCharts rejects empty data array", () => {
    const result = validateCharts([{ type: "bar", data: [] }]);
    expect(result.ok).toBe(false);
  });

  it("KPI report renders bar, line, and kpi_card charts", async () => {
    const sample = (await getTemplateSample("kpi_report")) as Record<string, unknown>;
    const created = await docforgeCreateDocument({ template_id: "kpi_report", data: sample });
    expect(created.status).toBe("created");
    const compiled = await docforgeCompileDocument(created.document_id!);
    expect(compiled.success).toBe(true);
    expect(compiled.page_count).toBeGreaterThanOrEqual(1);
  });

  it("sales_proposal renders process diagram", async () => {
    const sample = (await getTemplateSample("sales_proposal")) as Record<string, unknown>;
    expect(sample.diagram).toBeTruthy();
    const created = await docforgeCreateDocument({ template_id: "sales_proposal", data: sample });
    expect(created.status).toBe("created");
    const compiled = await docforgeCompileDocument(created.document_id!);
    expect(compiled.success).toBe(true);
  });

  it("research_report renders body_md markdown sections", async () => {
    const sample = (await getTemplateSample("research_report")) as Record<string, unknown>;
    const sections = sample.sections as Array<Record<string, unknown>>;
    expect(sections.some((s) => s.body_md)).toBe(true);
    const created = await docforgeCreateDocument({ template_id: "research_report", data: sample });
    expect(created.status).toBe("created");
    const compiled = await docforgeCompileDocument(created.document_id!);
    expect(compiled.success).toBe(true);
  });

  it("CSV attachment → monthly_metrics PDF end-to-end", async () => {
    const csv = `metric,value,target,trend,unit
MRR,125000,120000,up,USD
Churn,2.1,2.5,down,%
NPS,72,70,up,`;
    const created = await docforgeCreateDocument({
      template_id: "monthly_metrics",
      data: { title: "Q2 Metrics" },
      csv_attachment: csv,
    });
    expect(created.status).toBe("created");
    const compiled = await docforgeCompileDocument(created.document_id!);
    expect(compiled.success).toBe(true);
    const exported = await docforgeExportDocument({
      document_id: created.document_id!,
      formats: ["pdf"],
    });
    expect(exported.success).toBe(true);
    expect(exported.exports?.pdf).toBeTruthy();
  });

  it("csvToMonthlyMetricsData produces valid monthly_metrics shape", () => {
    const csv = `metric,value,target,trend
ARR,4200000,4000000,up`;
    const data = csvToMonthlyMetricsData(csv);
    expect(data.metrics).toBeTruthy();
    expect(Array.isArray(data.charts)).toBe(true);
    expect((data.charts as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it("rejects csv_attachment on non-monthly_metrics template", async () => {
    const created = await docforgeCreateDocument({
      template_id: "kpi_report",
      data: (await getTemplateSample("kpi_report")) as Record<string, unknown>,
      csv_attachment: "metric,value\nA,1",
    });
    expect(created.status).toBe("failed");
    expect(created.diagnostic?.message).toContain("monthly_metrics");
  });
});
