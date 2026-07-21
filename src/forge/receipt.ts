import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataRoot } from "../config.js";
import type { LintIssue } from "../lint/engine.js";
import type { VisualQAFinding } from "../qa/visual.js";
import type { FinalizableWorkflow } from "../slack/session.js";

export const FORGE_RECEIPT_SCHEMA_VERSION = "1.0.0" as const;

export type ForgePipelineStepId =
  | "gather"
  | "map"
  | "validate"
  | "compile"
  | "preflight"
  | "review"
  | "finalize";

export type ForgePipelineStepStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "skipped"
  | "warning";

export type ForgePipelineStep = {
  id: ForgePipelineStepId;
  status: ForgePipelineStepStatus;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  summary: string;
  details?: Record<string, unknown>;
};

export type ForgeGatherProvenance = {
  source_labels: string[];
  source_count: number;
  evidence_count?: number;
  coverage?: string;
  confidence?: string;
  gather_method?: string;
  warnings?: string[];
};

export type ForgeBuildReceipt = {
  schema_version: typeof FORGE_RECEIPT_SCHEMA_VERSION;
  build_id: string;
  workflow: FinalizableWorkflow;
  template: {
    id: string;
    version: string;
  };
  brand_id: string;
  parent_build_id?: string;
  sources: {
    count: number;
    labels: string[];
    evidence_count?: number;
    coverage?: string;
    confidence?: string;
    gather_method?: string;
    warnings?: string[];
  };
  pipeline: ForgePipelineStep[];
  compile: {
    duration_ms: number;
    page_count: number;
    attempts: number;
  };
  lint: {
    passed: boolean;
    error_count: number;
    warning_count: number;
    info_count: number;
    issues: LintIssue[];
  };
  preflight: {
    passed: boolean;
    error_count: number;
    warning_count: number;
    info_count: number;
    findings: VisualQAFinding[];
  };
  repairs: {
    applied: string[];
    count: number;
  };
  transport: {
    path: "mcp" | "in-process";
    mcp_child_pid?: number | null;
  };
  artifacts: {
    document_id: string;
    pdf_basename: string;
    receipt_basename: string;
  };
  review: {
    state: "draft" | "final";
    approved_by?: string;
    approved_at?: string;
  };
  version_diff?: {
    summary: string;
    field_changes: number;
    section_changes: number;
  };
  created_at: string;
  completed_at: string;
  total_duration_ms: number;
};

export type ProducePdfOptions = {
  workflow: FinalizableWorkflow;
  gather: ForgeGatherProvenance;
  brand_id?: string;
  parent_build_id?: string;
  review_state?: "draft" | "final";
  approved_by?: string;
  approved_at?: string;
  version_diff?: ForgeBuildReceipt["version_diff"];
};

export function newBuildId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
}

function step(
  id: ForgePipelineStepId,
  status: ForgePipelineStepStatus,
  summary: string,
  startedAt: number,
  completedAt: number,
  details?: Record<string, unknown>,
): ForgePipelineStep {
  return {
    id,
    status,
    started_at: new Date(startedAt).toISOString(),
    completed_at: new Date(completedAt).toISOString(),
    duration_ms: Math.max(0, completedAt - startedAt),
    summary,
    ...(details ? { details } : {}),
  };
}

function lintCounts(issues: LintIssue[]): {
  error_count: number;
  warning_count: number;
  info_count: number;
} {
  return {
    error_count: issues.filter((i) => i.severity === "error").length,
    warning_count: issues.filter((i) => i.severity === "warning").length,
    info_count: issues.filter((i) => i.severity === "info").length,
  };
}

function preflightCounts(findings: VisualQAFinding[]): {
  error_count: number;
  warning_count: number;
  info_count: number;
} {
  return {
    error_count: findings.filter((f) => f.severity === "error").length,
    warning_count: findings.filter((f) => f.severity === "warning").length,
    info_count: findings.filter((f) => f.severity === "info").length,
  };
}

export function buildForgeReceipt(input: {
  build_id: string;
  workflow: FinalizableWorkflow;
  template_id: string;
  template_version: string;
  brand_id: string;
  document_id: string;
  pdf_basename: string;
  gather: ForgeGatherProvenance;
  transport: ForgeBuildReceipt["transport"];
  compile_duration_ms: number;
  page_count: number;
  compile_attempts: number;
  lint_issues: LintIssue[];
  preflight_findings: VisualQAFinding[];
  repairs_applied: string[];
  pipeline_started_at: number;
  pipeline_completed_at: number;
  parent_build_id?: string;
  review_state?: "draft" | "final";
  approved_by?: string;
  approved_at?: string;
  version_diff?: ForgeBuildReceipt["version_diff"];
}): ForgeBuildReceipt {
  const gatherEnd = input.pipeline_started_at + 1;
  const mapEnd = gatherEnd + 1;
  const validateEnd = mapEnd + 1;
  const compileEnd = input.pipeline_completed_at - 2;
  const preflightEnd = input.pipeline_completed_at - 1;

  const lintCounts_ = lintCounts(input.lint_issues);
  const preflightCounts_ = preflightCounts(input.preflight_findings);
  const lintPassed = lintCounts_.error_count === 0;
  const preflightPassed = preflightCounts_.error_count === 0;

  const gatherSummary =
    input.gather.source_labels.length > 0
      ? `Gathered ${input.gather.source_count} source(s): ${input.gather.source_labels.join(", ")}`
      : `Gathered ${input.gather.source_count} source(s)`;

  const mapSummary = `Mapped to ${input.template_id}@${input.template_version}`;
  const validateSummary = lintPassed
    ? "Schema valid, lint passed"
    : `Lint failed (${lintCounts_.error_count} error(s))`;

  const compileSummary =
    `Typst compile: ${(input.compile_duration_ms / 1000).toFixed(1)}s, ` +
    `${input.page_count} page${input.page_count === 1 ? "" : "s"}` +
    (input.compile_attempts > 1 ? ` (${input.compile_attempts} attempts)` : "");

  const preflightWarnings = preflightCounts_.warning_count;
  const preflightSummary = preflightPassed
    ? preflightWarnings > 0
      ? `Visual preflight: ${preflightWarnings} warning(s)`
      : "Visual preflight: no issues"
    : `Visual preflight failed (${preflightCounts_.error_count} error(s))`;

  const reviewState = input.review_state ?? "draft";
  const reviewSummary =
    reviewState === "final"
      ? input.approved_by
        ? `Finalized by <@${input.approved_by}>`
        : "Finalized"
      : "Waiting for approval";

  const reviewEnd =
    reviewState === "final" ? input.pipeline_completed_at - 1 : input.pipeline_completed_at;
  const finalizeEnd = input.pipeline_completed_at;

  const receiptBasename = input.pdf_basename.replace(/\.pdf$/i, "") + "-receipt.json";

  const pipeline: ForgePipelineStep[] = [
    step("gather", "passed", gatherSummary, input.pipeline_started_at, gatherEnd, {
      gather_method: input.gather.gather_method,
      evidence_count: input.gather.evidence_count,
    }),
    step("map", "passed", mapSummary, gatherEnd, mapEnd),
    step("validate", lintPassed ? "passed" : "failed", validateSummary, mapEnd, validateEnd, {
      issue_count: input.lint_issues.length,
    }),
    step("compile", "passed", compileSummary, validateEnd, compileEnd, {
      attempts: input.compile_attempts,
      repairs: input.repairs_applied.length,
    }),
    step(
      "preflight",
      preflightPassed ? (preflightWarnings > 0 ? "warning" : "passed") : "failed",
      preflightSummary,
      compileEnd,
      preflightEnd,
      { finding_count: input.preflight_findings.length },
    ),
    step(
      "review",
      reviewState === "final" ? "passed" : "warning",
      reviewState === "final" ? "Human approved draft data" : reviewSummary,
      preflightEnd,
      reviewEnd,
    ),
  ];

  if (reviewState === "final") {
    pipeline.push(
      step(
        "finalize",
        "passed",
        reviewSummary,
        reviewEnd,
        finalizeEnd,
        input.approved_at ? { approved_at: input.approved_at } : undefined,
      ),
    );
  } else {
    pipeline[pipeline.length - 1] = step(
      "review",
      "warning",
      reviewSummary,
      preflightEnd,
      finalizeEnd,
    );
  }

  return {
    schema_version: FORGE_RECEIPT_SCHEMA_VERSION,
    build_id: input.build_id,
    workflow: input.workflow,
    template: { id: input.template_id, version: input.template_version },
    brand_id: input.brand_id,
    ...(input.parent_build_id ? { parent_build_id: input.parent_build_id } : {}),
    sources: {
      count: input.gather.source_count,
      labels: input.gather.source_labels,
      evidence_count: input.gather.evidence_count,
      coverage: input.gather.coverage,
      confidence: input.gather.confidence,
      gather_method: input.gather.gather_method,
      warnings: input.gather.warnings,
    },
    pipeline,
    compile: {
      duration_ms: input.compile_duration_ms,
      page_count: input.page_count,
      attempts: input.compile_attempts,
    },
    lint: {
      passed: lintPassed,
      ...lintCounts_,
      issues: input.lint_issues,
    },
    preflight: {
      passed: preflightPassed,
      ...preflightCounts_,
      findings: input.preflight_findings,
    },
    repairs: {
      applied: input.repairs_applied,
      count: input.repairs_applied.length,
    },
    transport: input.transport,
    artifacts: {
      document_id: input.document_id,
      pdf_basename: input.pdf_basename,
      receipt_basename: receiptBasename,
    },
    review: {
      state: reviewState,
      ...(input.approved_by ? { approved_by: input.approved_by } : {}),
      ...(input.approved_at ? { approved_at: input.approved_at } : {}),
    },
    ...(input.version_diff ? { version_diff: input.version_diff } : {}),
    created_at: new Date(input.pipeline_started_at).toISOString(),
    completed_at: new Date(input.pipeline_completed_at).toISOString(),
    total_duration_ms: Math.max(0, input.pipeline_completed_at - input.pipeline_started_at),
  };
}

export function receiptPathForDocument(documentId: string): string {
  return path.join(getDataRoot(), documentId, "build-receipt.json");
}

export async function writeBuildReceipt(
  documentId: string,
  receipt: ForgeBuildReceipt,
): Promise<string> {
  const filePath = receiptPathForDocument(documentId);
  await writeFile(filePath, JSON.stringify(receipt, null, 2), "utf8");
  return filePath;
}

export function sealFinalReceipt(
  draftReceipt: ForgeBuildReceipt,
  input: { approved_by: string; approved_at?: string },
): Partial<ProducePdfOptions> {
  return {
    parent_build_id: draftReceipt.build_id,
    review_state: "final",
    approved_by: input.approved_by,
    approved_at: input.approved_at ?? new Date().toISOString(),
    gather: {
      source_labels: draftReceipt.sources.labels,
      source_count: draftReceipt.sources.count,
      evidence_count: draftReceipt.sources.evidence_count,
      coverage: draftReceipt.sources.coverage,
      confidence: draftReceipt.sources.confidence,
      gather_method: draftReceipt.sources.gather_method,
      warnings: draftReceipt.sources.warnings,
    },
  };
}
