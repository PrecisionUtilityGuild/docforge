import { describe, expect, it } from "vitest";
import {
  gatherProvenanceFromBoard,
  gatherProvenanceFromDraft,
} from "../src/forge/gather-provenance.js";

describe("gather provenance", () => {
  it("reports CSV-backed monthly metrics drafts as metrics CSV", () => {
    const gather = gatherProvenanceFromDraft({
      id: "draft-1",
      templateId: "monthly_metrics",
      templateLabel: "Monthly metrics",
      filename: "Monthly-Metrics.pdf",
      draftData: {
        metrics: [{ name: "ARR", value: "4.2" }],
        commentary: "Strong quarter.",
      },
      replyChannelId: "C1",
      threadTs: "123.456",
      createdAt: Date.now(),
    });

    expect(gather).toMatchObject({
      source_labels: ["CSV metrics", "commentary"],
      source_count: 2,
      gather_method: "csv_and_notes",
    });
  });

  it("reports CSV-backed KPI drafts like board packs", () => {
    const gather = gatherProvenanceFromDraft({
      id: "draft-1",
      templateId: "kpi_report",
      templateLabel: "KPI report",
      filename: "Board-KPI-Pack.pdf",
      draftData: {
        kpis: [
          { name: "ARR", value: "4.2" },
          { name: "NRR", value: "112" },
        ],
        commentary: "CSV only",
      },
      replyChannelId: "C1",
      threadTs: "123.456",
      createdAt: Date.now(),
    });

    expect(gather).toMatchObject({
      source_labels: ["CSV metrics"],
      source_count: 2,
      gather_method: "csv_and_notes",
    });
  });

  it("keeps prose drafts on draft inference provenance", () => {
    const gather = gatherProvenanceFromDraft({
      id: "draft-1",
      templateId: "executive_memo",
      templateLabel: "Executive memo",
      filename: "Executive-Memo.pdf",
      draftData: { title: "Launch plan" },
      replyChannelId: "C1",
      threadTs: "123.456",
      createdAt: Date.now(),
    });

    expect(gather).toMatchObject({
      source_labels: ["pasted notes / thread context"],
      source_count: 1,
      gather_method: "draft_inference",
    });
  });

  it("board provenance ignores generated CSV-only commentary", () => {
    const gather = gatherProvenanceFromBoard({
      id: "board-1",
      period: "2026-Q1",
      csv: "metric,value\nARR,4.2",
      notes: "CSV only",
      filename: "Board-Pack-2026-Q1.pdf",
      draftData: { kpis: [{ name: "ARR", value: "4.2" }] },
      replyChannelId: "C1",
      threadTs: "123.456",
      createdAt: Date.now(),
    });

    expect(gather).toMatchObject({
      source_labels: ["CSV upload"],
      source_count: 1,
      gather_method: "csv_and_notes",
    });
  });
});
