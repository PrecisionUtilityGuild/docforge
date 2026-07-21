import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { docforgeCreateDocument, docforgeCompileDocument, initService } from "../src/service.js";
import { getTemplateSample } from "../src/templates/registry.js";
import { SUPPORTED_CHART_TYPES, validateChart } from "../src/data/charts.js";

let dataRoot = "";

describe("chart types (bar/line/area/pie/donut/waterfall/stacked_bar)", () => {
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "docforge-charts-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });
  afterEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
  });

  it("validator accepts every supported chart type", () => {
    for (const type of SUPPORTED_CHART_TYPES) {
      const r = validateChart({ type, data: [{ label: "A", value: 1 }] });
      expect(r.ok, `${type} should validate`).toBe(true);
    }
  });

  it("validator rejects an unknown chart type with an actionable message", () => {
    const r = validateChart({ type: "sankey", data: [{ label: "A", value: 1 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.agent_action).toContain("waterfall");
  });

  // Render each non-card chart type through a real template + Typst compile.
  const renderable = ["bar", "line", "area", "pie", "donut", "waterfall", "stacked_bar"] as const;
  for (const type of renderable) {
    it(`${type} compiles in kpi_report`, async () => {
      const base = (await getTemplateSample("kpi_report")) as Record<string, unknown>;
      const data = {
        ...base,
        charts: [
          {
            type,
            title: `${type} chart`,
            data: [
              { label: "Open", value: 120 },
              { label: "Add", value: 60 },
              { label: "Churn", value: -30 },
              { label: "Net", value: 150 },
            ],
            options: { unit: "USD" },
          },
        ],
      };
      const created = await docforgeCreateDocument({ template_id: "kpi_report", data });
      expect(created.status, JSON.stringify(created.diagnostic)).toBe("created");
      const compiled = await docforgeCompileDocument(created.document_id!);
      expect(compiled.success, JSON.stringify(compiled.diagnostics?.[0]?.message)).toBe(true);
    });
  }
});
