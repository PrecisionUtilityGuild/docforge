import { describe, expect, it } from "vitest";
import {
  assessBoardCsv,
  boardPdfFilename,
  extractBoardNotes,
  extractFencedCsv,
  findCsvFile,
  parseBoardPeriod,
  parseBoardPeriodHint,
} from "../src/slack/gather/board.js";
import { buildBoardDraft } from "../src/slack/workflows/board.js";
import { buildBoardConfirmBlocks } from "../src/slack/confirm/board.js";

const CSV = `metric,value,target,trend,unit
ARR,2400000,2200000,up,USD
New customers,1250,1000,up,count
NRR,108,105,up,percent`;

describe("board pack gather helpers", () => {
  it("extracts fenced CSV and period from a Slack command", () => {
    const text = `@forge board pack for Q3 operating review
\`\`\`csv
${CSV}
\`\`\`
Founder notes: Enterprise pipeline up 34%.`;

    expect(extractFencedCsv(text)).toBe(CSV);
    expect(parseBoardPeriod(text, new Date("2026-06-12T00:00:00Z"))).toBe("2026-Q3");
    expect(boardPdfFilename("2026-Q3")).toBe("Board-Pack-2026-Q3.pdf");
    expect(extractBoardNotes(text)).toContain("Founder notes");
  });

  it("extracts labelled periods without treating the label as commentary", () => {
    const text = `period: 2026-Q1
metric,value,target,trend,unit
ARR,4.2,4.0,up,USD
Strong quarter.`;

    expect(parseBoardPeriodHint(text)).toBe("2026-Q1");
    expect(extractBoardNotes(text)).toBe("Strong quarter.");
  });

  it("detects CSV attachments and validates metrics", () => {
    expect(findCsvFile([{ id: "F1", name: "board-pack.csv", mimetype: "text/csv" }])?.id).toBe(
      "F1",
    );

    const quality = assessBoardCsv(CSV);
    expect(quality.ok).toBe(true);
    expect(quality.metricNames).toEqual(["ARR", "New customers", "NRR"]);
  });

  it("builds schema-shaped draft data and confirm blocks", () => {
    const draft = buildBoardDraft(
      CSV,
      "Enterprise pipeline up 34%. Need board approval for partner program budget.",
      "2026-06",
    );
    expect(draft).toMatchObject({
      // Machine-assembled → ships DRAFT until a human approves/finalizes it.
      title: "DRAFT — Board KPI Pack — 2026-06",
      period: "2026-06",
      author: "Forge",
    });
    expect(draft.kpis).toHaveLength(3);

    const blocks = buildBoardConfirmBlocks({
      pendingId: "board-1",
      period: "2026-06",
      quality: assessBoardCsv(CSV),
      draftData: draft,
      filename: "Board-Pack-2026-06.pdf",
    });
    expect(blocks[0]).toMatchObject({ type: "section" });
    expect(JSON.stringify(blocks)).toContain("Board pack");
    expect(JSON.stringify(blocks)).toContain("Generate PDF");
    expect(blocks.some((block) => block.type === "actions")).toBe(true);
  });
});
