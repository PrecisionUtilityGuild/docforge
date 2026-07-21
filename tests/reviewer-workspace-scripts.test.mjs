import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  GENERAL_PIN,
  INCIDENT_MESSAGES,
  SALES_MESSAGES,
  STATUS_MESSAGES,
  boardPackCsvPath,
  formatTryCommands,
  seedChannel,
} from "../scripts/seed-workspace.mjs";
import {
  applyChannelFilter,
  formatTranscript,
  normalizeChannelFilter,
} from "../scripts/poll-slack.mjs";

describe("reviewer workspace scripts", () => {
  it("ships the exact seeded channels promised in DELIVERY.md", () => {
    expect(SALES_MESSAGES).toHaveLength(10);
    expect(SALES_MESSAGES.join("\n")).toMatch(/Northstar Analytics/i);
    expect(SALES_MESSAGES.join("\n")).toMatch(/No pricing in this channel/i);

    expect(INCIDENT_MESSAGES).toHaveLength(10);
    expect(INCIDENT_MESSAGES.join("\n")).toMatch(/5\.2%/);
    expect(INCIDENT_MESSAGES.join("\n")).toMatch(/47 minutes/);
    expect(INCIDENT_MESSAGES.at(-1)).toMatch(/Root cause confirmed/i);

    expect(STATUS_MESSAGES).toHaveLength(7);
    expect(STATUS_MESSAGES.join("\n")).toMatch(/on track/i);
    expect(STATUS_MESSAGES.join("\n")).toMatch(/Blocked/i);
    expect(STATUS_MESSAGES.join("\n")).toMatch(/critical/i);
  });

  it("prints reviewer commands and a board CSV fixture that exists", async () => {
    expect(GENERAL_PIN).toContain("@forge proposal for Northstar");
    expect(GENERAL_PIN).toContain("scripts/fixtures/board-pack.csv");

    expect(
      formatTryCommands({ incidentChannel: "incident-api-gateway", statusChannel: "team-eng" }),
    ).toMatchInlineSnapshot(`
        [
          "  @forge incident report from #incident-api-gateway",
          "  @forge proposal for Northstar",
          "  @forge status for #team-eng",
          "  @forge draft Weekly update: pipeline improved, onboarding risk remains, recommendation is a setup wizard.",
          "  DM: attach board-pack.csv + @forge board pack for Q3 operating review",
        ]
      `);

    const csv = await readFile(boardPackCsvPath(), "utf8");
    expect(csv).toContain("metric,value,target,trend,unit");
    expect(csv).toContain("ARR,2400000,2200000,up,USD");
  });

  it("skips missing seed channels without posting messages", async () => {
    const client = {
      conversations: {
        list: async () => ({ channels: [], response_metadata: {} }),
      },
      chat: {
        postMessage: async () => {
          throw new Error("should not post when channel is missing");
        },
      },
    };

    await expect(seedChannel(client, "missing-channel", ["hello"])).resolves.toBe(false);
  });

  it("formats poll output without blank messages and accepts #channel filters", () => {
    expect(normalizeChannelFilter("#team-eng")).toBe("team-eng");
    expect(normalizeChannelFilter("team-eng")).toBe("team-eng");
    expect(
      applyChannelFilter(
        [
          { id: "C1", name: "general" },
          { id: "C2", name: "team-eng" },
        ],
        "#team-eng",
      ),
    ).toEqual([{ id: "C2", name: "team-eng" }]);

    expect(
      formatTranscript([
        { text: "first" },
        { text: "   " },
        { text: undefined },
        { text: "second" },
      ]),
    ).toBe("first\nsecond");
  });
});
