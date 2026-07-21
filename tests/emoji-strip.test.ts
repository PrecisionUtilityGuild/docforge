import { describe, expect, it } from "vitest";
import { stripEmojiShortcodes, linesToTimeline } from "../src/slack/gather/transcript.js";

describe("emoji shortcode stripping for exported documents", () => {
  it("removes trailing emoji that leaked into the incident PDF", () => {
    expect(stripEmojiShortcodes("blocked on real-time data into AgentForce. :warning:")).toBe(
      "blocked on real-time data into AgentForce.",
    );
  });

  it("removes hyphenated and underscored shortcodes", () => {
    expect(stripEmojiShortcodes("review. :female-technologist:")).toBe("review.");
    expect(stripEmojiShortcodes("config package. :hammer_and_wrench:")).toBe("config package.");
    expect(stripEmojiShortcodes(":+1: Will also confirm")).toBe("Will also confirm");
  });

  it("does NOT touch real colons in prose (times, ratios, speaker prefixes)", () => {
    expect(stripEmojiShortcodes("meet at 2pm; ratio 3:2 holds")).toBe(
      "meet at 2pm; ratio 3:2 holds",
    );
    expect(stripEmojiShortcodes("16:10 Tim: heads up")).toBe("16:10 Tim: heads up");
  });

  it("collapses the whitespace left behind cleanly", () => {
    expect(stripEmojiShortcodes("great teamwork :memo: keep me posted")).toBe(
      "great teamwork keep me posted",
    );
  });

  it("strips emoji from the actual timeline events feeding the PDF", () => {
    const timeline = linesToTimeline([
      { ts: "1700000000.000", speaker: "Tim", text: "OAuth handshake issue :warning:" },
    ]);
    expect(timeline[0].event).not.toContain(":warning:");
    expect(timeline[0].event).toContain("OAuth handshake issue");
  });
});
