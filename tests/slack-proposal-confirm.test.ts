import { describe, expect, it } from "vitest";
import { buildProposalConfirmBlocks } from "../src/slack/confirm/proposal.js";

describe("proposal confirm blocks", () => {
  it("shows client, scope, and total without telemetry walls", () => {
    const blocks = buildProposalConfirmBlocks({
      pendingId: "id",
      source: {
        kind: "sales_channel",
        channelId: "C456",
        channelName: "acct-omega",
        clientName: "Omega",
        label: "#acct-omega",
      },
      quality: { ok: true, lineCount: 10, signals: ["discovery language"] },
      pricingRows: [
        { item: "Solution engineering", amount: "$96000" },
        { item: "Training", amount: "$8000" },
      ],
      draftData: {
        client: { name: "Omega" },
        scope: [{ item: "Inventory sync" }, { item: "SSO via Okta" }],
        pricing: { total: "$114,400" },
      },
      filename: "Omega-Proposal.pdf",
      contextLabel: "RTS gathered relevant discovery context",
      evidenceSnippets: [
        {
          label: "#acct-omega 10:15",
          text: "Inventory sync with Snowflake warehouse.",
          url: "https://slack.example/archives/C456/p17815512000001",
        },
      ],
    });

    const payload = JSON.stringify(blocks);
    expect(payload).toContain("Proposal — Omega");
    expect(payload).toContain("acct-omega");
    expect(payload).toContain("$104,000");
    expect(payload).toContain("Inventory sync");
    expect(payload).not.toContain("Slack evidence");
    expect(payload).not.toContain("RTS gathered");
    expect(payload).not.toContain("Preview");
    expect(payload).toContain("Generate PDF");
  });
});
