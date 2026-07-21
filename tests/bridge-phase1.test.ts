import { describe, expect, it, beforeEach } from "vitest";
import { stripSlackMarkup } from "../src/slack/gather/slack-markup.js";
import { normalizeWorkflowSource } from "../src/forge/source-text.js";
import { buildChartsFromMetrics } from "../src/data/charts.js";
import { csvAndNotesToKpiReport } from "../src/workflow-mappers/workflows.js";
import { buildDraftFromCustomTemplate, parseExplicitTemplateId } from "../src/templates/studio.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { initService } from "../src/service.js";
import { scaffoldRegisterAndProve } from "../src/templates/studio.js";

describe("slack markup strip", () => {
  it("converts Slack links to labels", () => {
    expect(stripSlackMarkup("See <https://trailhead.com|trailhead.com> for docs")).toBe(
      "See trailhead.com for docs",
    );
  });

  it("removes Slack emoji shortcodes without damaging real colons", () => {
    expect(
      stripSlackMarkup(
        ":grey_exclamation: *Campaign Goals* :one: Primary Goal: Drive awareness; ratio 3:2 holds",
      ),
    ).toBe("Campaign Goals Primary Goal: Drive awareness; ratio 3:2 holds");
  });

  it("strips using template clause from draft source", () => {
    const text = normalizeWorkflowSource("draft using acme_brief weekly notes here", {
      explicitTemplateId: "acme_brief",
    });
    expect(text.toLowerCase()).not.toContain("using acme_brief");
    expect(text).toContain("weekly notes");
  });
});

describe("board charts", () => {
  const csv = "metric,value,target,trend,unit\nARR,4.2,4.0,up,USD\nNRR,112,110,up,percent";

  it("adds charts[] to kpi_report mapper output", () => {
    const data = csvAndNotesToKpiReport(csv, "Strong quarter.") as {
      charts?: Array<{ type: string; data: unknown[] }>;
    };
    expect(data.charts).toBeDefined();
    expect(data.charts!.length).toBeGreaterThan(0);
    expect(data.charts![0]!.type).toBe("bar");
  });

  it("buildChartsFromMetrics groups by unit", () => {
    const charts = buildChartsFromMetrics([
      { name: "ARR", value: "4.2", unit: "USD" },
      { name: "NRR", value: "112", unit: "percent" },
    ]);
    expect(charts).toHaveLength(2);
  });
});

describe("custom template draft", () => {
  let dataRoot = "";

  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "bridge-custom-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
    await scaffoldRegisterAndProve({
      template_id: "acme_brief",
      name: "Acme Brief",
      description: "Test",
      fields: [
        { name: "summary", type: "string", required: true },
        { name: "body", type: "string" },
      ],
    });
  });

  it("does not echo using clause in PDF fields", async () => {
    expect(parseExplicitTemplateId("draft using acme_brief weekly sync notes")).toBe("acme_brief");
    const built = await buildDraftFromCustomTemplate(
      "acme_brief",
      "using acme_brief\nWeekly sync: shipped auth refresh.",
    );
    expect(JSON.stringify(built.draftData)).not.toMatch(/using acme_brief/i);
    expect(built.draftData.title).toMatch(/^DRAFT —/);
    expect(built.draftData.summary).toContain("shipped auth refresh");
  });
});
