import { describe, expect, it } from "vitest";
import { distillTimeline } from "../src/workflow-mappers/incident-timeline.js";
import type { TimelineEntry } from "../src/workflow-mappers/incident-parse.js";

const at = (time: string, event: string): TimelineEntry => ({ time, event });

describe("incident timeline distillation (narrative, not a chat dump)", () => {
  // Captured #service-swarm conversation, including social noise.
  const swarm: TimelineEntry[] = [
    at(
      "16:10",
      "Tim: Rahul from Northstar Analytics opened a Signature ticket for the MuleSoft SAP Connector. He's blocked getting real-time data into AgentForce.",
    ),
    at(
      "16:10",
      "Steven: Looks like there's an OAuth handshake issue plus confusion around IDoc mapping. I'll lead the connector config review.",
    ),
    at(
      "16:10",
      "Tim: Let's treat it as Tier 1 priority — integration is tied to a go-live next week.",
    ),
    at("16:10", "Tim: I'll coordinate timing with their integration lead."),
    at("16:10", "Steven: I'll prepare a checklist for the session."),
    at("16:10", "Tim: Great teamwork. Keep me posted after the session."),
    at("16:10", "Tim: Quick update — they're good to meet at 2pm PT today. Set up a Zoom."),
    at("16:10", "Steven: I'll review their connector config in advance."),
    at("16:10", "Tim: Great. Loop in our MuleSoft CSE team if it grows."),
  ];

  it("drops social chatter like 'Great teamwork'", () => {
    const t = distillTimeline(swarm);
    const joined = t.map((e) => e.event).join(" | ");
    expect(joined).not.toMatch(/great teamwork/i);
    expect(joined).not.toMatch(/keep me posted/i);
  });

  it("describes each event with the SIGNAL-bearing sentence, not the social preamble", () => {
    // Regression: a message like "Just read through the case. Looks like there's
    // an OAuth handshake issue…" classified on OAuth must DISPLAY the OAuth
    // clause, not the worthless "Just read through the case" lead.
    const t = distillTimeline(swarm);
    const joined = t.map((e) => e.event).join(" | ");
    expect(joined).toMatch(/OAuth handshake/i);
    expect(joined).not.toMatch(/just read through the case/i);
    // Leading social interjections are stripped from follow-up lines.
    expect(joined).not.toMatch(/^\s*perfect[,—]/im);
    expect(joined).not.toMatch(/\| perfect[,—]/i);
  });

  it("anchors the opener on the sentence that names the incident", () => {
    const t = distillTimeline(swarm);
    // First row should name the ticket/connector, not the trailing "He's blocked…".
    expect(t[0].event).toMatch(/ticket|MuleSoft|connector/i);
  });

  it("keeps the material events: detection, diagnosis, escalation, follow-up", () => {
    const t = distillTimeline(swarm);
    const joined = t
      .map((e) => e.event)
      .join(" | ")
      .toLowerCase();
    expect(joined).toMatch(/oauth|idoc|connector|handshake|diagnosis/);
    expect(joined).toMatch(/tier 1|escalation|priority/);
  });

  it("produces a tight timeline, far shorter than the raw chat", () => {
    const t = distillTimeline(swarm);
    expect(t.length).toBeGreaterThan(0);
    expect(t.length).toBeLessThan(swarm.length); // distilled, not dumped
    expect(t.length).toBeLessThanOrEqual(8);
  });

  it("collapses consecutive same-phase events (no repeated 'diagnosis' rows)", () => {
    const noisy = [
      at("10:00", "pager: error rate spiking on api-gateway"),
      at("10:01", "investigating, looks like a connection pool issue"),
      at("10:02", "yeah definitely connection pool exhaustion"),
      at("10:03", "rollback deployed"),
      at("10:05", "all clear, service restored"),
    ];
    const t = distillTimeline(noisy);
    const diagnosisRows = t.filter((e) => /investigat|connection pool|diagnosis/i.test(e.event));
    expect(diagnosisRows.length).toBeLessThanOrEqual(1);
  });

  it("always preserves detection and recovery as bookends", () => {
    const noisy = [
      at("10:00", "pager: errors spiking"),
      at("10:01", "investigating"),
      at("10:02", "tier 1, escalating"),
      at("10:03", "rolling back"),
      at("10:30", "all clear, recovered"),
    ];
    const t = distillTimeline(noisy, 3);
    expect(t[0].time).toBe("10:00"); // detection first
    expect(t[t.length - 1].event.toLowerCase()).toMatch(/recover|mitigated|restored/);
  });

  it("never emits an empty timeline (schema minItems: 1) even on terse input", () => {
    const terse = [at("09:00", "Someone: hi"), at("09:01", "Someone: ok thanks")];
    const t = distillTimeline(terse);
    expect(t.length).toBeGreaterThanOrEqual(1);
  });
});
