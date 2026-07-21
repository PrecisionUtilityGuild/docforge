import { describe, expect, it } from "vitest";
import { extractServices, inferActions } from "../src/workflow-mappers/incident-parse.js";
import {
  transcriptToIncidentReport,
  transcriptLinesToIncidentReport,
} from "../src/workflow-mappers/workflows.js";
import { enrichIncidentWithRts } from "../src/slack/gather/rts.js";

describe("incident extraction integrity (no fabrication)", () => {
  const realIncident = [
    "09:14 PagerDuty: checkout-service p99 latency 8s",
    "09:20 @maria: payment provider webhook backlog, retries piling up",
    "09:31 @derek: failing over to secondary payment region",
    "09:55 fully recovered. @maria will follow up with provider on webhook SLA",
    "action item: add alerting on webhook queue depth",
  ].join("\n");

  it("extracts only services that actually appear (not a hardcoded allowlist)", () => {
    const svc = extractServices(realIncident);
    expect(svc).toContain("Checkout-Service");
    // Must NOT invent the old hardcoded names that aren't present.
    expect(svc).not.toContain("Database");
    // Must NOT swallow whole sentences as service names.
    expect(svc.some((s) => s.toLowerCase().includes("will follow"))).toBe(false);
  });

  it("captures the real owner from an @mention commitment, no invented date", () => {
    const actions = inferActions(realIncident);
    const followUp = actions.find((a) => /follow up with provider/i.test(a.title));
    expect(followUp).toBeDefined();
    expect(followUp!.owner).toBe("Maria");
    expect(followUp!.due).toBe("Confirm before final approval");
  });

  it("does not treat 'failing over to' as an action with owner 'over'", () => {
    const actions = inferActions(realIncident);
    expect(actions.some((a) => a.owner.toLowerCase() === "over")).toBe(false);
  });

  it("captures labelled action items with an explicit review owner", () => {
    const actions = inferActions(realIncident);
    const labelled = actions.find((a) => /alerting on webhook queue/i.test(a.title));
    expect(labelled).toBeDefined();
    expect(labelled!.owner).toBe("Incident lead");
  });

  it("inserts a transparent review item (not an invented task) when no actions are stated", () => {
    const r = transcriptToIncidentReport("10:00 alert fired\n10:05 resolved itself") as {
      actions: Array<{ title: string; owner: string; due: string }>;
    };
    expect(r.actions.length).toBeGreaterThanOrEqual(1);
    expect(r.actions[0]!.title).toMatch(/none were captured/i);
    expect(r.actions[0]!.owner).toBe("Incident lead");
  });
});

describe("RTS incident enrichment (Slack-native, never throws)", () => {
  it("returns used:false with no action_token", async () => {
    const r = await enrichIncidentWithRts({
      client: {} as never,
      query: "q",
      actionToken: undefined,
      existing: [],
    });
    expect(r.used).toBe(false);
  });

  it("adds related lines from RTS, deduped against existing history", async () => {
    const client = {
      apiCall: async () => ({
        ok: true,
        results: {
          messages: [
            { text: "already in history", ts: "1.0", username: "alice" },
            { text: "related root-cause note from #postmortems", ts: "2.0", username: "bob" },
          ],
        },
      }),
    } as unknown as Parameters<typeof enrichIncidentWithRts>[0]["client"];

    const r = await enrichIncidentWithRts({
      client,
      query: "incident root cause",
      actionToken: "act-123",
      existing: [{ ts: "1.0", speaker: "alice", text: "already in history" }],
    });
    expect(r.used).toBe(true);
    expect(r.relatedLines).toHaveLength(1);
    expect(r.relatedLines[0]!.text).toMatch(/related root-cause/);
  });

  it("cites RTS-sourced messages (permalinks) in the report evidence", () => {
    const r = transcriptLinesToIncidentReport([
      { ts: "1.0", speaker: "pager", text: "checkout-service error rate 6%" },
      {
        ts: "2.0",
        speaker: "derek",
        text: "root cause: webhook retry storm",
        permalink: "https://northstar.slack.com/archives/C1/p2",
        channel: "postmortems",
      },
    ]) as { evidence: string };
    expect(r.evidence).toContain("Sources (via Slack Real-Time Search)");
    expect(r.evidence).toContain("#postmortems");
    expect(r.evidence).toContain("https://northstar.slack.com/archives/C1/p2");
  });

  it("adds no Sources block when no line carries a permalink (history-only)", () => {
    const r = transcriptLinesToIncidentReport([
      { ts: "1.0", speaker: "pager", text: "db error rate high" },
    ]) as { evidence: string };
    expect(r.evidence).not.toContain("Sources (via Slack Real-Time Search)");
  });

  it("swallows RTS errors and returns used:false", async () => {
    const client = {
      apiCall: async () => {
        throw new Error("rts exploded");
      },
    } as unknown as Parameters<typeof enrichIncidentWithRts>[0]["client"];
    const r = await enrichIncidentWithRts({
      client,
      query: "q",
      actionToken: "act",
      existing: [],
      logger: { warn: () => {} },
    });
    expect(r.used).toBe(false);
  });
});
