import { describe, expect, it } from "vitest";
import { transcriptLinesToProjectStatus } from "../src/workflow-mappers/project-status.js";
import { loadSchema, validateData } from "../src/validation/schema.js";
import { templateDir } from "./helpers.js";

const line = (text: string, i: number) => ({ ts: `${i}`, speaker: `u${i}`, text });

const CHANNEL = [
  "Deployed the new CI pipeline to staging, on track for prod next week.",
  "API gateway integration is delayed — waiting on partner sandbox certification.",
  "Dashboard analytics shipped, metrics parity at 92%.",
  "Blocked on finance approval for the reserved instance commitment.",
  "Next steps: run the gateway cutover dry run on June 17.",
  "lol nice 🎉 great work everyone",
  "Auth SSO endpoint failing in regression tests, critical to fix.",
].map(line);

describe("project_status mapper grounding", () => {
  it("produces a schema-valid status from channel lines", async () => {
    const data = transcriptLinesToProjectStatus(CHANNEL, {
      period: "June 2–8, 2026",
      channelLabel: "#team-platform",
    });
    const schema = await loadSchema(templateDir("project_status"));
    expect(validateData(schema, data).ok).toBe(true);
  });

  it("rolls up overall RAG to the worst workstream (red when something is failing)", () => {
    const data = transcriptLinesToProjectStatus(CHANNEL, { channelLabel: "#team-platform" });
    expect(data.overall_rag).toBe("red");
  });

  it("greens-out when everything is shipped and nothing is blocked", () => {
    const happy = [
      "Observability migration shipped, dashboards complete.",
      "API integration merged and on track.",
      "All analytics reports landed this week.",
    ].map(line);
    const data = transcriptLinesToProjectStatus(happy, { channelLabel: "#team" });
    expect(data.overall_rag).toBe("green");
  });

  it("grounds blockers in real 'blocked on' lines, not invented", () => {
    const data = transcriptLinesToProjectStatus(CHANNEL, { channelLabel: "#team-platform" });
    const blockers = data.blockers as string[];
    expect(blockers.some((b) => /finance approval/i.test(b))).toBe(true);
    expect(blockers.some((b) => /partner sandbox/i.test(b))).toBe(true);
  });

  it("filters social noise out of the workstreams", () => {
    const data = transcriptLinesToProjectStatus(CHANNEL, { channelLabel: "#team-platform" });
    expect(JSON.stringify(data)).not.toMatch(/great work everyone/i);
  });

  it("adds an evidence ledger from real source lines", () => {
    const data = transcriptLinesToProjectStatus(CHANNEL, { channelLabel: "#team-platform" });
    const evidence = data.evidence as Array<{ type: string; source: string; quote: string }>;
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence.some((e) => e.type === "blocker" && /finance approval/i.test(e.quote))).toBe(
      true,
    );
    expect(evidence.every((e) => e.source === "#team-platform" || /^u\d+$/.test(e.source))).toBe(
      true,
    );
    expect(JSON.stringify(evidence)).not.toMatch(/great work everyone/i);
  });

  it("preserves Slack provenance for evidence when channel/permalink are available", () => {
    const data = transcriptLinesToProjectStatus(
      [
        {
          ts: "1",
          speaker: "alice",
          text: "Blocked on finance approval for the reserved instance commitment.",
          channel: "platform",
          permalink: "https://example.slack.com/archives/C1/p1",
        },
      ],
      { channelLabel: "#team-platform" },
    );
    const evidence = data.evidence as Array<{ source: string; permalink?: string }>;
    expect(evidence[0]).toMatchObject({
      source: "#platform",
      permalink: "https://example.slack.com/archives/C1/p1",
    });
  });

  it("computes source audit confidence and coverage from evidence", () => {
    const data = transcriptLinesToProjectStatus(CHANNEL, { channelLabel: "#team-platform" });
    expect(data.source_audit).toMatchObject({
      confidence: "high",
      evidence_count: 6,
      sources: ["#team-platform"],
      coverage: {
        rag: 3,
        blocker: 2,
        next_step: 1,
        workstream: 0,
      },
      warnings: [],
    });
  });

  it("warns reviewers when source activity has no explicit next steps", () => {
    const data = transcriptLinesToProjectStatus(["Shipped the dashboard. API merged."].map(line), {
      channelLabel: "#team",
    });
    expect(data.source_audit).toMatchObject({
      confidence: "medium",
      warnings: ["No explicit next steps were found in source activity."],
    });
  });

  it("does not mistake 'next week' for a next step", () => {
    const data = transcriptLinesToProjectStatus(CHANNEL, { channelLabel: "#team-platform" });
    const steps = data.next_steps as string[];
    expect(steps.some((s) => /dry run on June 17/i.test(s))).toBe(true);
    expect(steps.some((s) => /Deployed the new CI pipeline/i.test(s))).toBe(false);
  });

  it("extracts the actual next-step section from Slack emoji-heavy campaign messages", () => {
    const data = transcriptLinesToProjectStatus(
      [
        line(
          ":grey_exclamation: *Campaign Goals* :grey_exclamation: :one: Primary Goal: Drive awareness :two: Secondary Goal: Increase awareness. Next Steps: - Align on audience strategy - Creative production",
          1,
        ),
        line(
          "Pacing update: delivery has stabilized, on track to deliver in full on schedule now.",
          2,
        ),
      ],
      { channelLabel: "#campaign-nto" },
    );

    const serialized = JSON.stringify(data);
    const steps = data.next_steps as string[];
    expect(steps).toContain("Align on audience strategy; Creative production");
    expect(steps.join(" ")).not.toMatch(/grey_exclamation|:one:|Campaign Goals/i);
    expect(serialized).not.toMatch(/grey_exclamation|:one:|:two:/i);
  });

  it("prompts for next steps when the channel states none", () => {
    const data = transcriptLinesToProjectStatus(["Shipped the dashboard. API merged."].map(line), {
      channelLabel: "#team",
    });
    const steps = data.next_steps as string[];
    expect(steps[0]).toMatch(/add before sending/i);
  });
});
