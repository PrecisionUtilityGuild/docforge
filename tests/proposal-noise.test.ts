import { describe, expect, it } from "vitest";
import {
  extractRequirements,
  proposalDiscoveryHighlights,
} from "../src/slack/gather/proposal-context.js";
import { isSocialNoise } from "../src/slack/gather/text-signals.js";

const omega = [
  "Lauren: Given the need to integrate the acquired company, the need for a solution is becoming more pressing and timing is right.",
  "Lauren: They need a solution that integrates with their existing systems.",
  "Lauren: We want SSO integration and KPI dashboards before go-live.",
  "Tim: Coffee run in 15 mins—react with if you want something! I'll check the reactions for headcount.",
  "Tim: Team lunch at Koji's Ramen in 20 mins if anyone wants to join.",
].join("\n");

describe("proposal gather: social noise never reaches a client-facing doc", () => {
  it("classifies coffee/lunch/poll chatter as noise", () => {
    expect(isSocialNoise("Coffee run in 15 mins—react with if you want something!")).toBe(true);
    expect(isSocialNoise("Team lunch at Koji's Ramen in 20 mins")).toBe(true);
    expect(isSocialNoise("We need SSO integration before go-live")).toBe(false);
  });

  it("keeps the coffee run OUT of scope and discovery notes", () => {
    const scope = extractRequirements(omega);
    const notes = proposalDiscoveryHighlights(omega);
    expect(scope).not.toMatch(/coffee|headcount|lunch|ramen/i);
    expect(notes).not.toMatch(/coffee|headcount|lunch|ramen/i);
  });

  it("shapes rambling discovery into crisp deliverables, not raw transcript", () => {
    const scope = extractRequirements(omega).split("\n");
    expect(scope).toContain("Integrate the acquired company.");
    // filler tail dropped:
    expect(scope.join(" ")).not.toMatch(/becoming more pressing|timing is right/i);
  });

  it("does not slice inside real tokens — 'SSO' survives (regression)", () => {
    const scope = extractRequirements("Lauren: We want SSO integration and KPI dashboards");
    expect(scope).toMatch(/SSO integration/);
    expect(scope).not.toMatch(/^S\.?$/m);
  });

  it("never puts a question into scope (questions are decisions, not deliverables)", () => {
    const scope = extractRequirements(
      "Tim: Let's treat it as Tier 1 priority — Rahul mentioned the integration is tied to a go-live next week. Can we set up a working session with his team today?",
    );
    expect(scope).not.toMatch(/\?/);
    expect(scope).not.toMatch(/working session/i);
  });

  it("never puts reporting/meta phrasing into scope ('Rahul mentioned …')", () => {
    const scope = extractRequirements(
      "Tim: Rahul mentioned the integration is tied to a go-live next week.",
    );
    expect(scope).not.toMatch(/mentioned/i);
  });
});
