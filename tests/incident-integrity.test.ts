import { describe, expect, it } from "vitest";
import { inferSeverity, extractUsersAffected } from "../src/workflow-mappers/incident-parse.js";

describe("incident severity integrity (no over-claiming)", () => {
  it("does NOT stamp 'high' on an incident the channel never characterized", () => {
    // A real incident with no severity language at all. The old code defaulted
    // to "high" — fabricating an urgency the transcript never stated.
    const s = inferSeverity("deploy went out at noon, a few users mentioned a hiccup");
    expect(s).toBe("medium");
  });

  it("still reads explicit high signals (Sev1/P1/error rate/outage)", () => {
    expect(inferSeverity("Sev1 declared, error rate climbing")).toBe("high");
    expect(inferSeverity("p0 outage, all hands")).toBe("critical");
  });

  it("honors an explicitly stated low/medium severity instead of escalating", () => {
    expect(inferSeverity("severity: low, minor cosmetic glitch")).toBe("low");
    expect(inferSeverity("this is a Sev2, contained quickly")).toBe("medium");
  });
});

describe("users-affected integrity (preserve stated figures)", () => {
  it("quotes a stated 'X% of <thing>' verbatim, not relabeled as an estimate", () => {
    const r = extractUsersAffected("about 45% of checkout sessions saw errors");
    expect(r).toBe("45% of checkout sessions");
    expect(r).not.toMatch(/estimated/i);
  });

  it("does not invent an impact figure when none is stated", () => {
    expect(extractUsersAffected("users were affected during the window")).toBeUndefined();
  });
});
