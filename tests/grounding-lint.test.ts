import { describe, expect, it } from "vitest";
import { groundingChecks, sourceCoverageScore } from "../src/lint/grounding.js";

describe("grounding lint", () => {
  it("flags unsupported absolute language without evidence as warning", () => {
    const issues = groundingChecks("sales_proposal", {
      title: "Proposal",
      executive_summary: "We will definitely deliver 100% uptime.",
      client: { name: "Acme" },
    });
    expect(issues.some((i) => i.check === "unsupported_claims" && i.severity === "warning")).toBe(
      true,
    );
  });

  it("downgrades unsupported claims to info when evidence exists", () => {
    const issues = groundingChecks("project_status", {
      title: "Status",
      summary: "We are guaranteed on track.",
      evidence: [{ type: "rag", source: "#eng", quote: "on track for prod" }],
      source_audit: {
        confidence: "high",
        evidence_count: 1,
        sources: ["#eng"],
        coverage: { rag: 1, blocker: 0, next_step: 0, workstream: 0 },
        warnings: [],
      },
    });
    const claim = issues.find((i) => i.check === "unsupported_claims");
    expect(claim?.severity).toBe("info");
  });

  it("requires blocker evidence when blockers are listed", () => {
    const issues = groundingChecks("project_status", {
      title: "Status",
      period: "Week 24",
      blockers: ["Finance approval pending"],
      next_steps: ["Ship cutover"],
      evidence: [],
      source_audit: {
        confidence: "low",
        evidence_count: 0,
        sources: [],
        coverage: { rag: 0, blocker: 0, next_step: 0, workstream: 0 },
        warnings: ["No grounding evidence captured"],
      },
    });
    expect(issues.some((i) => i.check === "missing_blocker_evidence")).toBe(true);
    expect(issues.some((i) => i.check === "source_coverage_low")).toBe(true);
    expect(issues.some((i) => i.check === "source_audit_warning")).toBe(true);
  });

  it("computes source coverage score from audit confidence", () => {
    expect(
      sourceCoverageScore({
        source_audit: { confidence: "high" },
      }),
    ).toBe(1);
    expect(
      sourceCoverageScore({
        evidence: [{ type: "blocker", source: "x", quote: "y" }],
      }),
    ).toBeGreaterThan(0.4);
  });
});
