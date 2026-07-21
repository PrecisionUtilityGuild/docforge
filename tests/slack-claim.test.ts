import { describe, expect, it } from "vitest";
import {
  createPendingBoardPack,
  createPendingIncident,
  createPendingProposal,
  takePendingBoardPack,
  takePendingIncident,
  takePendingProposalForConfirm,
} from "../src/slack/session.js";

const incidentBase = {
  source: {
    kind: "explicit_channel" as const,
    channelId: "C1",
    channelName: "incident-api-gateway",
    label: "#incident-api-gateway",
  },
  transcript: "t",
  draftData: {},
  filename: "INC-042-Report.pdf",
  replyChannelId: "C1",
  threadTs: "1.1",
};

describe("claim-on-read prevents double compile (F5)", () => {
  it("takePendingIncident returns once, then undefined", () => {
    const p = createPendingIncident(incidentBase);
    expect(takePendingIncident(p.id)?.id).toBe(p.id);
    expect(takePendingIncident(p.id)).toBeUndefined();
  });

  it("takePendingBoardPack returns once, then undefined", () => {
    const p = createPendingBoardPack({
      period: "2026-06",
      csv: "metric,value\nARR,1",
      notes: "n",
      draftData: {},
      filename: "Board-Pack-2026-06.pdf",
      replyChannelId: "C1",
      threadTs: "1.1",
    });
    expect(takePendingBoardPack(p.id)?.id).toBe(p.id);
    expect(takePendingBoardPack(p.id)).toBeUndefined();
  });

  it("takePendingProposalForConfirm only yields a confirmable (draftData) proposal once", () => {
    const awaiting = createPendingProposal({
      phase: "awaiting_pricing",
      clientName: "Northstar",
      source: {
        kind: "explicit_channel" as const,
        channelId: "C2",
        channelName: "sales-northstar",
        label: "#sales-northstar",
      },
      transcript: "t",
      requirements: "r",
      filename: "Northstar-Proposal.pdf",
      replyChannelId: "C2",
      threadTs: "2.2",
    });
    // No draftData yet → not confirmable.
    expect(takePendingProposalForConfirm(awaiting.id)).toBeUndefined();

    const ready = createPendingProposal({
      phase: "awaiting_confirm",
      clientName: "Northstar",
      source: {
        kind: "explicit_channel" as const,
        channelId: "C3",
        channelName: "sales-northstar",
        label: "#sales-northstar",
      },
      transcript: "t",
      requirements: "r",
      draftData: { title: "Proposal" },
      filename: "Northstar-Proposal.pdf",
      replyChannelId: "C3",
      threadTs: "3.3",
    });
    expect(takePendingProposalForConfirm(ready.id)?.id).toBe(ready.id);
    expect(takePendingProposalForConfirm(ready.id)).toBeUndefined();
  });
});
