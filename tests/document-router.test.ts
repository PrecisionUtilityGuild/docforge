import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { routeDocument } from "../src/forge/document-router.js";
import { initService } from "../src/service.js";
import { loadSchema, validateData } from "../src/validation/schema.js";
import { templateDir } from "./helpers.js";

let dataRoot = "";

describe("document router", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "doc-router-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  it("routes pasted CSV to monthly_metrics with charts", async () => {
    const csv = "metric,value,target,trend,unit\nRevenue,120,100,up,USD\nUsers,4500,4000,up,count";
    const routed = await routeDocument({
      sourceText: csv,
      commandText: "draft make pdf",
    });
    expect(routed.templateId).toBe("monthly_metrics");
    expect(routed.draftData.charts).toBeDefined();
    const schema = await loadSchema(templateDir("monthly_metrics"));
    expect(validateData(schema, routed.draftData).ok).toBe(true);
  });

  it("routes board context CSV to kpi_report", async () => {
    const csv = "metric,value,target,trend,unit\nARR,4.2,4.0,up,USD";
    const routed = await routeDocument({
      sourceText: `${csv}\nboard pack notes`,
      commandText: "board pack",
    });
    expect(routed.templateId).toBe("kpi_report");
    expect(routed.draftData.charts).toBeDefined();
  });

  it("keeps explicit monthly metrics CSV on the chart ingestion path", async () => {
    const csv = "metric,value,target,trend,unit\nRevenue,120,100,up,USD";
    const routed = await routeDocument({
      sourceText: csv,
      commandText: "document monthly_metrics",
      explicitTemplateId: "monthly_metrics",
      period: "2026-Q1",
      commentary: "Revenue outperformed plan.",
    });
    expect(routed.templateId).toBe("monthly_metrics");
    expect(routed.routedBy).toBe("csv");
    expect(routed.draftData.period).toBe("2026-Q1");
    expect(routed.draftData.commentary).toBe("Revenue outperformed plan.");
    expect(routed.draftData.charts).toBeDefined();
    expect(routed.filename).toBe("Monthly-Metrics-2026-Q1.pdf");
  });

  it("does not let board wording override explicit monthly metrics", async () => {
    const csv = "metric,value,target,trend,unit\nRevenue,120,100,up,USD";
    const routed = await routeDocument({
      sourceText: "Board wants this in the monthly packet.",
      csv,
      explicitTemplateId: "monthly_metrics",
      period: "2026-Q1",
      commentary: "Board wants this in the monthly packet.",
    });
    expect(routed.templateId).toBe("monthly_metrics");
    expect(routed.routedBy).toBe("csv");
    expect(routed.draftData.period).toBe("2026-Q1");
    expect(routed.filename).toBe("Monthly-Metrics-2026-Q1.pdf");
  });

  it("keeps explicit kpi_report CSV on the board-pack mapper", async () => {
    const csv = "metric,value,target,trend,unit\nARR,4.2,4.0,up,USD";
    const routed = await routeDocument({
      sourceText: csv,
      commandText: "document kpi_report",
      explicitTemplateId: "kpi_report",
    });
    expect(routed.templateId).toBe("kpi_report");
    expect(routed.routedBy).toBe("csv");
    expect(routed.filename).toBe("Board-KPI-Pack.pdf");
  });

  it("still infers prose templates for unstructured notes", async () => {
    const routed = await routeDocument({
      sourceText:
        "Decision: adopt Postgres. Context: latency. Consequences: ops work. Alternative: Mongo.",
      commandText: "draft",
    });
    expect(routed.templateId).toBe("decision_record");
  });
});
