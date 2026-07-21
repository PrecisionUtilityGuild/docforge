import { describe, expect, it } from "vitest";
import { buildForgeReceipt, FORGE_RECEIPT_SCHEMA_VERSION } from "../src/forge/receipt.js";

describe("forge build receipt", () => {
  it("builds a complete auditable receipt with pipeline steps", () => {
    const started = Date.now() - 500;
    const completed = Date.now();
    const receipt = buildForgeReceipt({
      build_id: "8F31",
      workflow: "proposal",
      template_id: "sales_proposal",
      template_version: "1.0.0",
      brand_id: "default",
      document_id: "doc-abc",
      pdf_basename: "Northstar-Proposal.pdf",
      gather: {
        source_labels: ["#sales-northstar"],
        source_count: 42,
        evidence_count: 3,
        gather_method: "rts_and_history",
        confidence: "high",
      },
      transport: { path: "mcp", mcp_child_pid: 12345 },
      compile_duration_ms: 2100,
      page_count: 7,
      compile_attempts: 1,
      lint_issues: [],
      preflight_findings: [],
      repairs_applied: [],
      pipeline_started_at: started,
      pipeline_completed_at: completed,
    });

    expect(receipt.schema_version).toBe(FORGE_RECEIPT_SCHEMA_VERSION);
    expect(receipt.build_id).toBe("8F31");
    expect(receipt.pipeline.map((s) => s.id)).toEqual([
      "gather",
      "map",
      "validate",
      "compile",
      "preflight",
      "review",
    ]);
    expect(receipt.pipeline.find((s) => s.id === "gather")?.summary).toContain("42 source");
    expect(receipt.pipeline.find((s) => s.id === "compile")?.summary).toContain("2.1s");
    expect(receipt.pipeline.find((s) => s.id === "compile")?.summary).toContain("7 pages");
    expect(receipt.pipeline.find((s) => s.id === "review")?.summary).toContain(
      "Waiting for approval",
    );
    expect(receipt.artifacts.receipt_basename).toBe("Northstar-Proposal-receipt.json");
    expect(receipt.lint.passed).toBe(true);
    expect(receipt.preflight.passed).toBe(true);
    expect(receipt.transport.path).toBe("mcp");
  });

  it("records lint and preflight warnings without failing passed flags when no errors", () => {
    const now = Date.now();
    const receipt = buildForgeReceipt({
      build_id: "A1B2",
      workflow: "status",
      template_id: "project_status",
      template_version: "1.0.0",
      brand_id: "default",
      document_id: "doc-xyz",
      pdf_basename: "Status-Eng.pdf",
      gather: { source_labels: ["#team-eng"], source_count: 8 },
      transport: { path: "in-process" },
      compile_duration_ms: 800,
      page_count: 2,
      compile_attempts: 2,
      lint_issues: [
        {
          check: "todo_placeholders",
          severity: "warning",
          message: "Placeholder text found",
          agent_action: "Replace markers",
        },
      ],
      preflight_findings: [
        {
          check: "cramped_layout",
          severity: "warning",
          message: "Page 1 appears visually cramped",
          agent_action: "Reduce content",
          lint_missed: true,
        },
      ],
      repairs_applied: ["truncate_string"],
      pipeline_started_at: now - 100,
      pipeline_completed_at: now,
    });

    expect(receipt.lint.passed).toBe(true);
    expect(receipt.lint.warning_count).toBe(1);
    expect(receipt.preflight.passed).toBe(true);
    expect(receipt.preflight.warning_count).toBe(1);
    expect(receipt.repairs.count).toBe(1);
    expect(receipt.pipeline.find((s) => s.id === "preflight")?.status).toBe("warning");
  });

  it("adds a finalize step when review_state is final", () => {
    const now = Date.now();
    const receipt = buildForgeReceipt({
      build_id: "FIN1",
      workflow: "proposal",
      template_id: "sales_proposal",
      template_version: "1.0.0",
      brand_id: "default",
      document_id: "doc-final",
      pdf_basename: "Northstar-Proposal.pdf",
      gather: { source_labels: ["#sales"], source_count: 10 },
      transport: { path: "mcp" },
      compile_duration_ms: 1000,
      page_count: 5,
      compile_attempts: 1,
      lint_issues: [],
      preflight_findings: [],
      repairs_applied: [],
      pipeline_started_at: now - 100,
      pipeline_completed_at: now,
      review_state: "final",
      approved_by: "U123",
      approved_at: new Date(now).toISOString(),
      parent_build_id: "DRAFT1",
    });

    expect(receipt.pipeline.map((s) => s.id)).toContain("finalize");
    expect(receipt.review.state).toBe("final");
    expect(receipt.parent_build_id).toBe("DRAFT1");
  });
});
