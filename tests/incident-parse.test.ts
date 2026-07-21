import { describe, expect, it } from "vitest";
import {
  extractRootCause,
  inferSeverity,
  isRootCauseConfirmed,
  parseTimelineLine,
} from "../src/workflow-mappers/incident-parse.js";
import {
  transcriptLinesToIncidentReport,
  transcriptToIncidentReport,
} from "../src/workflow-mappers/workflows.js";
import {
  expandMultilineMessages,
  formatTranscriptLine,
  linesToTimeline,
  linesToTranscript,
  slackTsToClock,
} from "../src/slack/gather/transcript.js";
import { channelNameToIncidentId } from "../src/slack/gather/channels.js";

const INCIDENT_TRANSCRIPT = `14:02 Pager: api-gateway error rate 5.2%
14:08 @sre: opening incident bridge
14:18 Root cause likely connection pool after cache flush
14:35 Rollback deployed, errors dropping
14:49 All clear — critical path restored`;

describe("incident parsing", () => {
  it("parses embedded timeline lines from workflow transcript", () => {
    const lines = INCIDENT_TRANSCRIPT.split("\n");
    expect(parseTimelineLine(lines[0], 0)).toEqual({
      time: "14:02",
      event: "Pager: api-gateway error rate 5.2%",
    });
    expect(parseTimelineLine(lines[2], 2).event).toContain("connection pool");
  });

  it("unwraps slack-prefixed pasted lines", () => {
    const wrapped = "13:48 romanvonzeac: 14:02 Pager: api-gateway error rate 5.2%";
    expect(parseTimelineLine(wrapped, 0)).toEqual({
      time: "14:02",
      event: "Pager: api-gateway error rate 5.2%",
    });
  });

  it("does not mark severity critical from critical path restored", () => {
    expect(inferSeverity(INCIDENT_TRANSCRIPT)).toBe("high");
  });

  it("treats likely root cause as unconfirmed", () => {
    expect(isRootCauseConfirmed(INCIDENT_TRANSCRIPT)).toBe(false);
    expect(extractRootCause(INCIDENT_TRANSCRIPT)).toContain("connection pool");
  });

  it("computes duration from timeline span", () => {
    const data = transcriptToIncidentReport(INCIDENT_TRANSCRIPT);
    expect(data.duration ?? (data.impact as { duration: string }).duration).toBeTruthy();
    expect((data.impact as { duration: string }).duration).toBe("47 minutes");
    expect(data.severity).toBe("high");
  });

  it("pads incident channel ids", () => {
    expect(channelNameToIncidentId("incident-42")).toBe("INC-042");
    expect(channelNameToIncidentId("incident-api-gateway")).toBeUndefined();
  });
});

describe("slack transcript formatting", () => {
  it("splits multiline slack messages using slack timestamps, not pasted HH:MM", () => {
    const lines = [
      {
        ts: "1710000000.0001",
        speaker: "romanvonzeac",
        text: INCIDENT_TRANSCRIPT,
      },
    ];
    const clock = slackTsToClock("1710000000.0001");
    const transcript = linesToTranscript(lines);
    expect(transcript).toContain(`${clock} Pager: api-gateway error rate 5.2%`);
    expect(transcript).not.toContain("14:02 Pager:");
    expect(transcript.split("\n")).toHaveLength(5);

    const timeline = linesToTimeline(lines);
    expect(timeline[0].time).toBe(clock);
    expect(timeline[0].event).toBe("Pager: api-gateway error rate 5.2%");
  });

  it("builds incident reports from slack lines with real timestamps", () => {
    const data = transcriptLinesToIncidentReport([
      { ts: "1710000000.0001", speaker: "bot", text: "Pager: api-gateway error rate 5.2%" },
      { ts: "1710002820.0001", speaker: "sre", text: "All clear — critical path restored" },
    ]);
    const timeline = data.timeline as Array<{ time: string; event: string }>;
    expect(timeline[0].time).toBe(slackTsToClock("1710000000.0001"));
    expect(timeline[1].time).toBe(slackTsToClock("1710002820.0001"));
  });

  it("formats plain messages with speaker labels", () => {
    expect(
      formatTranscriptLine({
        ts: "1710000000.0001",
        speaker: "sre",
        text: "opening incident bridge",
      }),
    ).toMatch(/^\d{2}:\d{2} sre: opening incident bridge$/);
  });

  it("expands multiline messages before formatting", () => {
    const expanded = expandMultilineMessages([
      { ts: "1.0", speaker: "u", text: "line one\nline two" },
    ]);
    expect(expanded).toHaveLength(2);
  });
});
