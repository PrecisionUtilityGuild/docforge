import { describe, expect, it } from "vitest";
import { isSocialNoise, salience, isDocumentWorthy } from "../src/slack/gather/text-signals.js";

describe("shared text signals — one noise lexicon for all workflows", () => {
  it("flags social/logistics chatter as noise", () => {
    for (const n of [
      "Coffee run in 15 mins—react with if you want something!",
      "Team lunch at Koji's Ramen in 20 mins",
      "Great teamwork. Keep me posted.",
      "standup in 5",
      "thanks!",
      "👍",
    ]) {
      expect(isSocialNoise(n), n).toBe(true);
    }
  });

  it("does NOT flag real work substance as noise", () => {
    for (const w of [
      "We need SSO integration before go-live",
      "Looks like an OAuth handshake issue plus IDoc mapping confusion",
      "Tier 1 priority — integration tied to a go-live next week",
    ]) {
      expect(isSocialNoise(w), w).toBe(false);
    }
  });
});

describe("salience — transparent multi-signal relevance (not embeddings)", () => {
  it("scores noise at zero", () => {
    expect(salience("Coffee run in 15 mins")).toBe(0);
    expect(salience("thanks!")).toBe(0);
  });

  it("ranks a requirement above a vague aside", () => {
    const req = salience("We need SSO integration and KPI dashboards before go-live");
    const aside = salience("ok let me think about that");
    expect(req).toBeGreaterThan(aside);
  });

  it("rewards naming a system and a commitment", () => {
    expect(salience("The MuleSoft SAP Connector is failing the OAuth handshake")).toBeGreaterThan(
      2,
    );
    expect(salience("Steven will review the connector config before the session")).toBeGreaterThan(
      1,
    );
  });

  it("isDocumentWorthy gates on the threshold", () => {
    expect(isDocumentWorthy("We need API integration and data migration")).toBe(true);
    expect(isDocumentWorthy("Coffee run?")).toBe(false);
    expect(isDocumentWorthy("ok")).toBe(false);
  });
});
