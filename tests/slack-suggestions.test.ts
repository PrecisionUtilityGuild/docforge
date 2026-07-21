import { describe, expect, it } from "vitest";
import { suggestedPromptsForChannel } from "../src/slack/agent/suggestions.js";

describe("context-aware suggested prompts (Slack AI surface)", () => {
  it("leads with the incident workflow when opened in an incident channel", () => {
    const p = suggestedPromptsForChannel({ name: "incident-api-gateway" });
    expect(p[0].title).toBe("Incident report from this channel");
    expect(p[0].message).toBe("incident report from #incident-api-gateway");
  });

  it("detects incident intent from the channel topic, not just the name", () => {
    const p = suggestedPromptsForChannel({
      name: "war-room",
      topic: "Active Sev1 outage bridge",
    });
    expect(p[0].message).toContain("incident report from #war-room");
  });

  it("leads with a client-named proposal for a sales channel", () => {
    const p = suggestedPromptsForChannel({ name: "sales-northstar" });
    expect(p[0].title).toBe("Proposal for Northstar");
    expect(p[0].message).toBe("proposal for Northstar");
  });

  it("does not present a year/quarter as a client name (no fabrication)", () => {
    const year = suggestedPromptsForChannel({ name: "sales-2024" });
    const quarter = suggestedPromptsForChannel({ name: "deal-q3" });
    // Still a proposal channel, but the lead is generic — not "Proposal for 2024".
    expect(year[0].title).not.toMatch(/2024/);
    expect(quarter[0].title).not.toMatch(/q3/i);
    expect(year[0].message).toContain("proposal");
  });

  it("leads with the board pack for a metrics/board channel", () => {
    const p = suggestedPromptsForChannel({ name: "board-prep", topic: "Quarterly KPI review" });
    expect(p[0].title).toContain("Board pack");
  });

  it("leads with the status workflow for team/status channels", () => {
    const p = suggestedPromptsForChannel({ name: "team-eng", topic: "Weekly sprint status" });
    expect(p[0].title).toBe("Status report from this channel");
    expect(p[0].message).toBe("status for #team-eng");
  });

  it("always offers draft plus the curated workflows (relevant one first, others retained)", () => {
    const p = suggestedPromptsForChannel({ name: "incident-7" });
    expect(p.length).toBeGreaterThanOrEqual(4);
    const titles = p.map((x) => x.title.toLowerCase());
    expect(titles.some((t) => t.includes("proposal"))).toBe(true);
    expect(titles.some((t) => t.includes("board"))).toBe(true);
    expect(titles.some((t) => t.includes("draft"))).toBe(true);
  });

  it("falls back to generic prompts in a DM / unknown channel (no fabrication)", () => {
    const dm = suggestedPromptsForChannel({ name: "incident-1", isDm: true });
    const unknown = suggestedPromptsForChannel({ name: "random-watercooler" });
    expect(dm[0].title).toBe("Draft PDF");
    expect(unknown[0].title).toBe("Draft PDF");
  });

  it("is deterministic — same channel signal yields identical prompts", () => {
    const a = suggestedPromptsForChannel({ name: "incident-api-gateway" });
    const b = suggestedPromptsForChannel({ name: "incident-api-gateway" });
    expect(a).toEqual(b);
  });
});
