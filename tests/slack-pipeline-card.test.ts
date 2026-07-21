import { describe, expect, it } from "vitest";
import { buildForgeReceipt } from "../src/forge/receipt.js";
import {
  buildPipelineCardBlocks,
  formatPipelineStatusText,
} from "../src/slack/confirm/pipeline.js";

function sampleReceipt() {
  const now = Date.now();
  return buildForgeReceipt({
    build_id: "8F31",
    workflow: "proposal",
    template_id: "sales_proposal",
    template_version: "1.0.0",
    brand_id: "default",
    document_id: "doc-1",
    pdf_basename: "Northstar-Proposal.pdf",
    gather: {
      source_labels: ["#sales-northstar", "1 CSV"],
      source_count: 42,
      evidence_count: 3,
    },
    transport: { path: "mcp" },
    compile_duration_ms: 2100,
    page_count: 7,
    compile_attempts: 1,
    lint_issues: [],
    preflight_findings: [],
    repairs_applied: [],
    pipeline_started_at: now - 400,
    pipeline_completed_at: now,
  });
}

describe("slack pipeline card", () => {
  it("formats the live status text shown during compile", () => {
    const text = formatPipelineStatusText(sampleReceipt());
    expect(text).toContain("Forge Build #8F31");
    expect(text).toContain("✓");
    expect(text).toContain("Typst compile: 2.1s, 7 pages");
    expect(text).toContain("Waiting for approval");
    expect(text).toContain("DocForge MCP");
  });

  it("renders a rich Block Kit card with template and preflight metadata", () => {
    const blocks = buildPipelineCardBlocks({
      receipt: sampleReceipt(),
      filename: "Northstar-Proposal.pdf",
      finalizeId: "fin-1",
      showApprovalActions: true,
    });

    const payload = JSON.stringify(blocks);
    expect(payload).toContain("Forge Build #8F31");
    expect(payload).toContain("sales_proposal@1.0.0");
    expect(payload).toContain("Northstar-Proposal-receipt.json");
    expect(payload).not.toContain("forge_feedback_approved");
  });
});
