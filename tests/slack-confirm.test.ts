import { describe, expect, it } from "vitest";
import { buildIncidentConfirmBlocks } from "../src/slack/confirm/incident.js";
import { buildStatusConfirmBlocks } from "../src/slack/confirm/status.js";

describe("incident confirm blocks", () => {
  it("shows source, root cause, timeline, and generate action", () => {
    const blocks = buildIncidentConfirmBlocks({
      pendingId: "test-id",
      source: {
        kind: "explicit_channel",
        channelId: "C123",
        channelName: "incident-api-gateway",
        label: "#incident-api-gateway",
      },
      quality: {
        ok: true,
        lineCount: 23,
        signals: ["incident language", "root-cause discussion"],
      },
      transcript: "Root cause confirmed: pool limits",
      title: "Production Incident Report",
      filename: "INC-042-Report.pdf",
      draftData: {
        severity: "high",
        root_cause: "Connection pool limits too low",
        impact: { duration: "47 minutes" },
        timeline: [
          { time: "14:32", event: "PagerDuty: SEV1 api-gateway error rate" },
          { time: "14:33", event: "@oncall: seeing 502s on checkout" },
          { time: "14:40", event: "Rollback deployed" },
        ],
      },
    });

    const json = JSON.stringify(blocks);
    expect(json).toContain("Incident report");
    expect(json).toContain("incident-api-gateway");
    expect(json).toContain("Connection pool limits");
    expect(json).toContain("14:32");
    expect(json).toContain("Generate PDF");
    expect(json).not.toContain("Preview");
    expect(blocks.some((b) => b.type === "actions")).toBe(true);
  });
});

describe("status confirm blocks", () => {
  it("shows overall RAG, workstreams, and blockers without audit walls", () => {
    const blocks = buildStatusConfirmBlocks({
      pendingId: "status-id",
      channelLabel: "#team-platform",
      lineCount: 8,
      filename: "Status-team-platform.pdf",
      draftData: {
        overall_rag: "amber",
        workstreams: [{ name: "API & Integrations", rag: "amber" }],
        blockers: ["Partner sandbox certification is delayed."],
        next_steps: ["No explicit next steps captured from the channel — add before sending."],
        evidence: [
          {
            type: "blocker",
            source: "#team-platform",
            quote: "API gateway integration is delayed while partner certification is pending.",
          },
        ],
        source_audit: {
          confidence: "medium",
          evidence_count: 1,
          sources: ["#team-platform"],
          coverage: { rag: 0, blocker: 1, next_step: 0, workstream: 0 },
          warnings: ["No explicit next steps were found in source activity."],
        },
      },
    });

    const json = JSON.stringify(blocks);
    expect(json).toContain("#team-platform");
    expect(json).toContain("API & Integrations");
    expect(json).toContain("Partner sandbox certification");
    expect(json).not.toContain("Source audit");
    expect(json).not.toContain("Evidence preview");
    expect(json).toContain("Generate PDF");
  });
});
