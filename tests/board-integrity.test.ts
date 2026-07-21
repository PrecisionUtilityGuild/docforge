import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { csvAndNotesToKpiReport } from "../src/workflow-mappers/workflows.js";
import { buildBoardDraft } from "../src/slack/workflows/board.js";
import { buildBoardConfirmBlocks } from "../src/slack/confirm/board.js";
import { loadSchema, validateData } from "../src/validation/schema.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type Board = {
  kpis: Array<{ name: string; value: string }>;
  risks?: Array<{ description: string; severity: string }>;
  asks?: Array<{ title: string; owner: string }>;
};

const CSV_STRONG = "metric,value,target,trend,unit\nARR,4.2,4.0,up,USD\nNRR,112,110,up,percent";
const CSV_WEAK = "metric,value,target,trend,unit\nARR,3.2,4.0,down,USD\nNRR,112,110,up,percent";

describe("board KPI integrity (no fabricated risks/asks)", () => {
  it("omits risks and asks entirely when nothing is grounded in the data/notes", () => {
    const r = csvAndNotesToKpiReport(CSV_STRONG, "Strong quarter, retention healthy.") as Board;
    expect(r.risks).toBeUndefined();
    expect(r.asks).toBeUndefined();
  });

  it("never injects the old hardcoded pipeline risk or hiring ask", () => {
    const r = csvAndNotesToKpiReport(CSV_STRONG, "All good.") as Board;
    const json = JSON.stringify(r);
    expect(json).not.toContain("Pipeline conversion below target");
    expect(json).not.toContain("Approve expanded hiring plan");
  });

  it("derives a real risk from a KPI that is genuinely below its target", () => {
    const r = csvAndNotesToKpiReport(CSV_WEAK, "Revenue soft.") as Board;
    expect(r.risks).toBeDefined();
    expect(r.risks![0]!.description).toContain("ARR is below target");
    expect(r.risks![0]!.description).toContain("3.2");
    expect(r.risks![0]!.severity).toBe("high"); // 20% gap
  });

  it("extracts a board ask only from explicit ask/approval language in notes", () => {
    const r = csvAndNotesToKpiReport(
      CSV_STRONG,
      "Good quarter.\nAsk: approve additional sales headcount",
    ) as Board;
    expect(r.asks).toBeDefined();
    expect(r.asks![0]!.title).toMatch(/sales headcount/i);
  });

  it("preserves the user's KPI values verbatim (no markup/rounding of board numbers)", () => {
    const r = csvAndNotesToKpiReport(CSV_WEAK, "") as Board;
    const arr = r.kpis.find((k) => k.name === "ARR");
    expect(arr!.value).toBe("3.2");
  });

  it("flags lower-is-better metrics as risks when they are ABOVE target", () => {
    // Churn 3.1 vs 2.5 and CAC payback 18 vs 14 are BAD (higher = worse).
    // The old value<target rule silently missed these.
    const csv =
      "metric,value,target,trend,unit\nChurn,3.1,2.5,down,percent\nCAC Payback,18,14,down,months";
    const r = csvAndNotesToKpiReport(csv, "") as Board;
    const text = JSON.stringify(r.risks);
    expect(r.risks).toHaveLength(2);
    expect(text).toMatch(/Churn is above target \(3\.1 vs 2\.5\)/);
    expect(text).toMatch(/CAC Payback is above target \(18 vs 14\)/);
  });

  it("does NOT flag a lower-is-better metric that is below target (that's good)", () => {
    const csv = "metric,value,target,trend,unit\nChurn,2.0,2.5,down,percent";
    const r = csvAndNotesToKpiReport(csv, "") as Board;
    expect(r.risks).toBeUndefined();
  });

  it("fabricates NO board ask when the user supplies no notes", () => {
    // Regression: the default commentary boilerplate ("…asks for the next
    // meeting") used to be mined into a invented ask.
    const csv = "metric,value,target,trend,unit\nARR,4.2,4.0,up,USD";
    const r = csvAndNotesToKpiReport(csv, "") as Board;
    expect(r.asks).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain("For the next meeting");
  });

  it("grounds the summary in the data when no notes are given", () => {
    const r = csvAndNotesToKpiReport(CSV_WEAK, "") as Board & { summary: string };
    expect(r.summary).toMatch(/KPIs?/i);
    expect(r.summary).not.toMatch(/highlight outperformance|prepare concise asks/i);
  });

  it("buildBoardDraft validates against the kpi_report schema with NO notes", async () => {
    // Regression: buildBoardDraft overrode summary/commentary with empty notes,
    // producing '' and failing the schema's minLength:1.
    const draft = buildBoardDraft(CSV_WEAK, "", "2026-06");
    expect(typeof draft.summary).toBe("string");
    expect((draft.summary as string).length).toBeGreaterThan(0);
    expect((draft.commentary as string).length).toBeGreaterThan(0);

    const schema = await loadSchema(path.join(repoRoot, "templates", "kpi_report"));
    const result = validateData(schema, draft);
    if (!result.ok) throw new Error(result.diagnostic.message);
    expect(result.ok).toBe(true);
  });

  it("confirm card is compact — no duplicate review boilerplate", () => {
    const blocks = buildBoardConfirmBlocks({
      pendingId: "p",
      period: "2026-06",
      quality: { ok: true, lineCount: 3, metricNames: ["ARR"] },
      draftData: {},
      filename: "b.pdf",
    });
    const json = JSON.stringify(blocks);
    expect(json).toContain("Generate PDF");
    expect(json.split("review before sending").length - 1).toBe(0);
  });
});
