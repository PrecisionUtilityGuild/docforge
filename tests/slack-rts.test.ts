import { describe, expect, it, vi } from "vitest";
import {
  gatherProposalContext,
  enrichIncidentWithRts,
  incidentRtsProvenance,
  proposalGatherProvenance,
  proposalRtsQuery,
  rtsMessagesToTranscript,
} from "../src/slack/gather/rts.js";

const source = {
  kind: "sales_channel" as const,
  channelId: "C123",
  channelName: "sales-northstar",
  clientName: "Northstar",
  label: "#sales-northstar",
};

describe("proposal Real-Time Search gather", () => {
  it("uses assistant.search.context when an action token is available", async () => {
    const client = {
      apiCall: vi.fn(async () => ({
        ok: true,
        results: [
          {
            text: "Northstar needs SSO and inventory integration before go-live.",
            ts: "1710000000.0001",
            user_name: "sales",
          },
        ],
      })),
      conversations: {
        history: vi.fn(),
        replies: vi.fn(),
      },
      users: { info: vi.fn() },
    };

    const result = await gatherProposalContext({
      client: client as never,
      source,
      actionToken: "rts-token",
    });

    expect(result.method).toBe("rts");
    expect(result.transcript).toContain("Northstar needs SSO");
    expect(client.apiCall).toHaveBeenCalledWith(
      "assistant.search.context",
      expect.objectContaining({
        action_token: "rts-token",
        query: proposalRtsQuery(source),
        content_types: ["messages"],
        include_context_messages: true,
      }),
    );
    expect(client.conversations.history).not.toHaveBeenCalled();
  });

  it("falls back to channel history when RTS is unavailable", async () => {
    const client = {
      apiCall: vi.fn(async () => ({ ok: true, results: [] })),
      conversations: {
        history: vi.fn(async () => ({
          messages: [
            {
              ts: "1710000000.0001",
              text: "Scope notes: API integration, SSO, admin training",
              user: "U1",
            },
          ],
        })),
        replies: vi.fn(),
      },
      users: {
        info: vi.fn(async () => ({ user: { name: "sales" } })),
      },
    };

    const result = await gatherProposalContext({
      client: client as never,
      source,
      actionToken: "rts-token",
    });

    expect(result.method).toBe("history_fallback");
    expect(result.rtsAttempted).toBe(true);
    expect(result.fallbackReason).toMatch(/no usable/i);
    expect(result.transcript).toContain("API integration");
  });

  it("uses history directly when Slack does not provide an action token", async () => {
    const client = {
      apiCall: vi.fn(),
      conversations: {
        history: vi.fn(async () => ({
          messages: [
            {
              ts: "1710000000.0001",
              text: "Northstar wants KPI dashboards in about 10 weeks.",
              user: "U1",
            },
          ],
        })),
        replies: vi.fn(),
      },
      users: {
        info: vi.fn(async () => ({ user: { name: "sales" } })),
      },
    };

    const result = await gatherProposalContext({ client: client as never, source });

    expect(result.method).toBe("history_fallback");
    expect(result.rtsAttempted).toBe(false);
    expect(client.apiCall).not.toHaveBeenCalled();
  });

  it("extracts nested Slack search messages defensively", () => {
    const transcript = rtsMessagesToTranscript({
      ok: true,
      messages: {
        matches: [
          {
            message: {
              text: "Timeline is about 10 weeks.",
              ts: "1710000000.0001",
              user_name: "ae",
            },
          },
        ],
      },
    } as never);

    expect(transcript.transcript).toContain("Timeline is about 10 weeks");
  });
});

describe("RTS provenance is legible in-thread", () => {
  const base = { label: "#sales-northstar", rtsQuery: "q", transcript: "" };

  it("names Real-Time Search with the hit count when RTS is used", () => {
    const line = proposalGatherProvenance({
      ...base,
      lines: [1, 2, 3] as never,
      method: "rts",
      rtsAttempted: true,
    });
    expect(line).toMatch(/Real-Time Search/);
    expect(line).toContain("assistant.search.context");
    expect(line).toContain("3 messages");
  });

  it("explains the history fallback explicitly", () => {
    const noToken = proposalGatherProvenance({
      ...base,
      lines: [] as never,
      method: "history_fallback",
      rtsAttempted: false,
      fallbackReason: "No Slack action_token in listener context",
    });
    expect(noToken).toMatch(/channel history/);
    expect(noToken).toMatch(/no Real-Time Search token/);

    const emptyRts = proposalGatherProvenance({
      ...base,
      lines: [] as never,
      method: "history_fallback",
      rtsAttempted: true,
      fallbackReason: "RTS returned no usable message text",
    });
    expect(emptyRts).toMatch(/returned nothing usable/);
  });

  it("reports incident RTS enrichment only when it added evidence", () => {
    expect(
      incidentRtsProvenance({
        used: true,
        query: "q",
        relatedLines: [1, 2] as never,
        sources: ["#alerts"],
      }),
    ).toMatch(/added 2 related messages from #alerts/);
    expect(
      incidentRtsProvenance({ used: false, query: "q", relatedLines: [], sources: [] }),
    ).toBeUndefined();
  });

  it("uses RTS result channels, not speakers, as incident enrichment sources", async () => {
    const client = {
      apiCall: vi.fn(async () => ({
        ok: true,
        results: [
          {
            text: "Gateway deploy is blocked on partner certification.",
            ts: "1710000000.0001",
            user_name: "alice",
            channel_name: "alerts",
          },
        ],
      })),
    };

    const enrichment = await enrichIncidentWithRts({
      client: client as never,
      query: "gateway blockers",
      actionToken: "rts-token",
      existing: [],
    });

    expect(enrichment.used).toBe(true);
    expect(enrichment.sources).toEqual(["#alerts"]);
    expect(incidentRtsProvenance(enrichment)).toMatch(/from #alerts/);
  });

  it("does not render user fallback sources as channel names", async () => {
    const client = {
      apiCall: vi.fn(async () => ({
        ok: true,
        results: [
          {
            text: "Gateway deploy is blocked on partner certification.",
            ts: "1710000000.0001",
            user_name: "alice",
          },
        ],
      })),
    };

    const enrichment = await enrichIncidentWithRts({
      client: client as never,
      query: "gateway blockers",
      actionToken: "rts-token",
      existing: [],
    });

    expect(enrichment.sources).toEqual(["alice"]);
  });
});
