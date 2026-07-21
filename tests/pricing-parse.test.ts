import { describe, expect, it } from "vitest";
import { parsePricingLines, pricingSubtotal } from "../src/slack/gather/pricing.js";
import {
  assessProposalTranscript,
  extractRequirements,
  inferProposalTimeline,
  parseClientName,
  proposalEvidenceSnippets,
  resolveClientDisplayName,
  salesChannelName,
} from "../src/slack/gather/proposal-context.js";
import { expandMultilineMessages } from "../src/slack/gather/transcript.js";
import { buildProposalDraft } from "../src/slack/workflows/proposal.js";
import { proposalPdfFilename } from "../src/slack/gather/channels.js";

describe("pricing parse", () => {
  it("parses em-dash and hyphen line items", () => {
    const rows = parsePricingLines(`Solution engineering — $96000
Project management - $12000
Training: $8000`);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ item: "Solution engineering", amount: "$96000" });
    expect(pricingSubtotal(rows)).toBe(116000);
  });

  it("parses space-separated amounts without a dash", () => {
    expect(parsePricingLines("Training 8000")).toEqual([{ item: "Training", amount: "$8000" }]);
  });

  it("ignores non-pricing chatter", () => {
    expect(parsePricingLines("thanks, working on it")).toHaveLength(0);
  });

  it("does not treat small bare numbers as pricing", () => {
    expect(parsePricingLines("Phase: 1\nTimeline: 10")).toHaveLength(0);
    expect(parsePricingLines("Pilot: $99")).toEqual([{ item: "Pilot", amount: "$99" }]);
  });
});

describe("proposal thread follow-up", () => {
  it("resolves thread anchor for channel replies", async () => {
    const { proposalThreadAnchor } = await import("../src/slack/workflows/proposal-followup.js");
    expect(
      proposalThreadAnchor({
        threadTs: "100.0001",
        threadParentTs: "100.0001",
        inThread: true,
      } as Parameters<typeof proposalThreadAnchor>[0]),
    ).toBe("100.0001");
  });
});

describe("proposal context", () => {
  it("maps Northstar to sales-northstar channel name", () => {
    expect(parseClientName("@forge proposal for Northstar")).toBe("Northstar");
    expect(salesChannelName("Northstar")).toBe("sales-northstar");
    expect(proposalPdfFilename("Northstar")).toBe("Northstar-Proposal.pdf");
  });

  it("resolves client display name from transcript", () => {
    expect(
      resolveClientDisplayName("Northstar", "Kickoff with *Northstar Analytics* — ERP integration"),
    ).toBe("Northstar Analytics");
  });

  it("assesses seeded sales transcript", () => {
    const transcript = `Kickoff with Northstar Analytics — ERP integration
Jordan: need inventory sync with Snowflake
SSO via Okta is mandatory`;
    const quality = assessProposalTranscript(transcript);
    expect(quality.ok).toBe(true);
  });

  it("extracts deduped proposal scope instead of raw Slack chatter", () => {
    const transcript = `10:00 sam: Kickoff with *Northstar Analytics* — ERP + analytics integration discovery.
10:01 Jordan (Northstar): need inventory sync with Snowflake warehouse, near-real-time.
10:02 sam: They want custom KPI templates for ops leadership — not our default dashboards.
10:03 sam: SSO via Okta is mandatory before go-live.
10:04 sam: Timeline pressure: board wants something in ~10 weeks.
10:05 sam: Scope notes: API integration, KPI dashboards, admin training. No pricing in this channel yet.
10:06 sam: Next: solution engineering to draft proposal — @forge when ready.`;

    const requirements = extractRequirements(transcript);
    expect(requirements).toContain("Inventory sync with Snowflake warehouse");
    expect(requirements).toContain("KPI templates");
    expect(requirements).toContain("SSO via Okta");
    expect(requirements).not.toMatch(/@forge|No pricing|Next:/i);
    expect(requirements.split("\n").length).toBeLessThanOrEqual(6);
  });

  it("shapes proposal draft with inferred 10-week timeline and process diagram", () => {
    const transcript = `Kickoff with *Northstar Analytics* — ERP integration discovery.
Timeline pressure: board wants something in ~10 weeks.
Scope notes: API integration, KPI dashboards, admin training.`;
    const requirements = extractRequirements(transcript);
    const draft = buildProposalDraft("Northstar", transcript, requirements, [
      { item: "Solution engineering", amount: "$96000" },
    ]);

    expect(inferProposalTimeline(transcript)[1]?.duration).toBe("6 weeks");
    expect(draft.title).toBe("DRAFT — Proposal — Northstar Analytics");
    expect(draft.timeline).toContainEqual(
      expect.objectContaining({ phase: "Implementation", duration: "6 weeks" }),
    );
    expect(draft.diagram).toMatchObject({ type: "process" });
    expect(String(draft.discovery_notes)).not.toMatch(/No pricing|@forge/i);
  });

  it("extracts source evidence snippets with Slack permalinks", () => {
    const snippets = proposalEvidenceSnippets([
      {
        ts: "1781551200.0001",
        speaker: "Jordan",
        channel: "sales-northstar",
        permalink: "https://slack.example/archives/C1/p17815512000001",
        text: "Need inventory sync with Snowflake before go-live.",
      },
      {
        ts: "1781551260.0001",
        speaker: "Sam",
        channel: "sales-northstar",
        text: "thanks!",
      },
    ]);

    expect(snippets).toEqual([
      expect.objectContaining({
        label: expect.stringContaining("#sales-northstar"),
        text: "Need inventory sync with Snowflake before go-live.",
        url: "https://slack.example/archives/C1/p17815512000001",
      }),
    ]);
  });

  it("keeps provenance when expanding multiline Slack messages", () => {
    const expanded = expandMultilineMessages([
      {
        ts: "1781551200.0001",
        speaker: "Jordan",
        channel: "sales-northstar",
        permalink: "https://slack.example/archives/C1/p17815512000001",
        text: "Need SSO\nNeed admin training",
      },
    ]);

    expect(expanded).toHaveLength(2);
    expect(expanded[1]).toMatchObject({
      channel: "sales-northstar",
      permalink: "https://slack.example/archives/C1/p17815512000001",
      text: "Need admin training",
    });
  });
});
