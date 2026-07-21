import { describe, expect, it } from "vitest";
import {
  extractServices,
  extractRootCause,
  isRootCauseConfirmed,
  extractUsersAffected,
} from "../src/workflow-mappers/incident-parse.js";

describe("incident entity grounding (pull real entities, don't overclaim)", () => {
  const swarm =
    "Rahul from Northstar Analytics opened a Signature ticket for the MuleSoft SAP Connector. " +
    "He's blocked getting real-time data into AgentForce. " +
    "Looks like there's an OAuth handshake issue plus confusion around IDoc mapping.";

  it("captures named integrations/products, not just *-service infra names", () => {
    expect(extractServices(swarm)).toContain("MuleSoft SAP Connector");
  });

  it("still captures classic hyphenated infra services with correct casing", () => {
    const svc = extractServices("checkout-service 500s, api-gateway degraded");
    expect(svc).toContain("Checkout-Service");
    expect(svc).toContain("API-Gateway");
  });

  it("surfaces a tentative cause as 'Suspected', and marks it unconfirmed", () => {
    const cause = extractRootCause(swarm);
    expect(cause).toMatch(/^Suspected:/);
    expect(cause).toMatch(/OAuth handshake/i);
    expect(isRootCauseConfirmed(swarm)).toBe(false);
  });

  it("captures a stated/declared cause without the 'Suspected' hedge", () => {
    const cause = extractRootCause(
      "Postmortem: the outage was caused by connection pool exhaustion",
    );
    expect(cause).toMatch(/connection pool exhaustion/i);
    expect(cause).not.toMatch(/suspected/i);
  });

  it("does NOT fabricate a users-affected figure when none is stated", () => {
    // The swarm ticket states no user-impact percentage — honest answer is none.
    expect(extractUsersAffected(swarm)).toBeUndefined();
  });

  it("does not over-capture product-like phrases from casual prose", () => {
    expect(extractServices("Great meeting about the New York Office today")).toEqual([]);
  });
});
