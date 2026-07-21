import { buildForgeReceipt } from "../src/forge/receipt.js";
import type { ForgeBuildReceipt } from "../src/forge/receipt.js";
import type { FinalizableWorkflow } from "../src/slack/session.js";

export function sampleBuildReceipt(
  overrides: Partial<{
    build_id: string;
    workflow: FinalizableWorkflow;
    template_id: string;
    page_count: number;
    preflight_findings: ForgeBuildReceipt["preflight"]["findings"];
  }> = {},
): ForgeBuildReceipt {
  const now = Date.now();
  return buildForgeReceipt({
    build_id: overrides.build_id ?? "TEST",
    workflow: overrides.workflow ?? "board",
    template_id: overrides.template_id ?? "kpi_report",
    template_version: "1.0.0",
    brand_id: "default",
    document_id: "doc-test",
    pdf_basename: "Board-Pack.pdf",
    gather: { source_labels: ["CSV upload"], source_count: 4 },
    transport: { path: "mcp" },
    compile_duration_ms: 1200,
    page_count: overrides.page_count ?? 3,
    compile_attempts: 1,
    lint_issues: [],
    preflight_findings: overrides.preflight_findings ?? [],
    repairs_applied: [],
    pipeline_started_at: now - 200,
    pipeline_completed_at: now,
  });
}
