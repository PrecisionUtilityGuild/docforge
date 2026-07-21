import { describe, expect, it } from "vitest";
import { assessIncidentTranscript, resolveIncidentSource } from "../src/slack/gather/context.js";

const INCIDENT_TRANSCRIPT = `14:02 Pager: api-gateway error rate 5.2%
14:08 sre: opening incident bridge
14:18 Root cause likely connection pool after cache flush`;

describe("incident context resolution", () => {
  it("prefers explicit channel when named", async () => {
    const source = await resolveIncidentSource(
      {
        conversations: { info: async () => ({ channel: { name: "incident-api-gateway" } }) },
      } as never,
      "incident report from <#C1|incident-api-gateway>",
      { replyChannelId: "C9", isDm: false, inThread: false },
    );
    expect(source.kind).toBe("explicit_channel");
    if (source.kind === "explicit_channel") {
      expect(source.channelId).toBe("C1");
      expect(source.label).toBe("#incident-api-gateway");
    }
  });

  it("uses thread when command runs inside a thread", async () => {
    const source = await resolveIncidentSource(
      { conversations: { info: async () => ({}) } } as never,
      "incident report",
      {
        replyChannelId: "C9",
        isDm: false,
        inThread: true,
        threadParentTs: "100.1",
      },
    );
    expect(source.kind).toBe("thread");
    if (source.kind === "thread") {
      expect(source.threadTs).toBe("100.1");
      expect(source.label).toBe("this thread");
    }
  });

  it("asks for location in a DM without pointers", async () => {
    const source = await resolveIncidentSource(
      { conversations: { info: async () => ({}) } } as never,
      "incident report",
      { replyChannelId: "D1", isDm: true, inThread: false },
    );
    expect(source.kind).toBe("unresolved");
  });

  it("rejects thin non-incident transcripts", () => {
    expect(assessIncidentTranscript("hello team").ok).toBe(false);
    expect(assessIncidentTranscript(INCIDENT_TRANSCRIPT).ok).toBe(true);
  });
});
