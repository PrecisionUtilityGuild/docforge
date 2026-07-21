import { describe, expect, it } from "vitest";
import {
  channelNameToIncidentId,
  incidentPdfFilename,
  parseChannelRef,
} from "../src/slack/gather/channels.js";
import { fetchChannelTranscript } from "../src/slack/gather/history.js";
import {
  isRootCauseConfirmed,
  linesToTranscript,
  slackTsToClock,
} from "../src/slack/gather/transcript.js";

describe("channel parsing", () => {
  it("parses Slack channel links", () => {
    expect(parseChannelRef("incident report from <#C123|incident-api-gateway>")).toEqual({
      channelId: "C123",
      channelName: "incident-api-gateway",
    });
  });

  it("parses hash channel names", () => {
    expect(parseChannelRef("incident report from #incident-api-gateway")).toEqual({
      channelName: "incident-api-gateway",
    });
  });

  it("maps channel names to incident ids and filenames", () => {
    expect(channelNameToIncidentId("incident-42")).toBe("INC-042");
    expect(channelNameToIncidentId("incident-api-gateway")).toBeUndefined();
    expect(incidentPdfFilename("incident-api-gateway")).toBe("Incident-Report.pdf");
  });
});

describe("transcript helpers", () => {
  it("formats lines chronologically", () => {
    const transcript = linesToTranscript([
      { ts: "1710000000.0001", speaker: "Pager", text: "api-gateway error rate 5.2%" },
      { ts: "1710000360.0001", speaker: "sre", text: "opening incident bridge" },
    ]);
    expect(transcript).toContain("Pager: api-gateway error rate 5.2%");
    expect(transcript).toContain("sre: opening incident bridge");
  });

  it("detects confirmed vs weak root cause", () => {
    expect(isRootCauseConfirmed("14:18 Root cause likely connection pool after cache flush")).toBe(
      false,
    );
    expect(isRootCauseConfirmed("14:18 Root cause was connection pool exhaustion")).toBe(true);
    expect(isRootCauseConfirmed("still investigating impact")).toBe(false);
  });

  it("formats slack timestamps as HH:MM", () => {
    expect(slackTsToClock("1710000000.0001")).toMatch(/^\d{2}:\d{2}$/);
  });

  it("filters bot-authored history even when Slack omits bot_message subtype", async () => {
    const client = {
      conversations: {
        history: async () => ({
          messages: [
            {
              ts: "3",
              user: "U_BOT",
              bot_id: "B_FORGE",
              text: "Forge live QA: generating project status PDF from #campaign-nto.",
            },
            {
              ts: "2",
              user: "U1",
              text: "Pacing update: delivery has stabilized and is on track.",
            },
          ],
        }),
      },
      users: {
        info: async () => ({ user: { profile: { display_name: "Regina" } } }),
      },
    };

    const gathered = await fetchChannelTranscript(client as never, "C1");
    expect(gathered.transcript).toContain("Pacing update");
    expect(gathered.transcript).not.toContain("Forge live QA");
    expect(gathered.lines).toHaveLength(1);
  });

  it("keeps substantive bot-authored seed and integration context", async () => {
    const client = {
      conversations: {
        history: async () => ({
          messages: [
            {
              ts: "3",
              user: "U_BOT",
              bot_id: "B_FORGE",
              text: "Kickoff with *Northstar Analytics* — ERP + analytics integration discovery.",
            },
            {
              ts: "2",
              user: "U_BOT",
              bot_id: "B_FORGE",
              text: "PagerDuty: *SEV1* api-gateway error rate 5.2% (threshold 1%)",
            },
          ],
        }),
      },
      users: {
        info: async () => ({ user: { profile: { display_name: "Forge" } } }),
      },
    };

    const gathered = await fetchChannelTranscript(client as never, "C1");
    expect(gathered.transcript).toContain("Northstar Analytics");
    expect(gathered.transcript).toContain("SEV1");
    expect(gathered.lines).toHaveLength(2);
  });
});
