import { loadDocument, saveDocument } from "../documents/store.js";
import { lintDocument } from "../lint/engine.js";
import type { LintIssue } from "../lint/types.js";
import { repairDocumentData } from "../repair/engine.js";
import { suggestRepairsFromVisualFindings } from "../repair/suggestions.js";
import { saveVersionSnapshot } from "../versioning/store.js";
import { runVisualQA, type VisualQAFinding } from "./visual.js";

export const MAX_PREFLIGHT_REPAIR_ROUNDS = 2;

export type PreflightOutcome = {
  ok: boolean;
  findings: VisualQAFinding[];
  preflight_repairs_applied: string[];
  repair_rounds: number;
};

type PreflightDeps = {
  compile: (documentId: string) => Promise<{ success: boolean }>;
};

/**
 * Run visual QA and deterministically repair layout issues the engine knows how
 * to fix (cramped pages, overflow, blank pages, page budget). Re-lints after
 * each repair round. Warnings that cannot be auto-fixed are returned for review.
 */
export async function runPreflightWithRepairs(
  documentId: string,
  deps: PreflightDeps,
  options: { maxRounds?: number; repairsApplied?: string[] } = {},
): Promise<PreflightOutcome> {
  const maxRounds = options.maxRounds ?? MAX_PREFLIGHT_REPAIR_ROUNDS;
  const preflightRepairs: string[] = [];
  let rounds = 0;
  let lastFindings: VisualQAFinding[] = [];

  for (let round = 0; round <= maxRounds; round++) {
    const doc = await loadDocument(documentId);
    if (!doc) {
      return {
        ok: false,
        findings: lastFindings,
        preflight_repairs_applied: preflightRepairs,
        repair_rounds: rounds,
      };
    }

    const lint = await lintDocument(doc);
    const qa = await runVisualQA(doc, lint.issues);
    lastFindings = qa.findings;

    if (qa.ok && !hasRepairableWarnings(qa.findings)) {
      return {
        ok: true,
        findings: qa.findings,
        preflight_repairs_applied: preflightRepairs,
        repair_rounds: rounds,
      };
    }

    if (round === maxRounds) {
      return {
        ok: qa.ok,
        findings: qa.findings,
        preflight_repairs_applied: preflightRepairs,
        repair_rounds: rounds,
      };
    }

    const suggestions = suggestRepairsFromVisualFindings(qa.findings, doc);
    if (!suggestions.length) {
      return {
        ok: qa.ok,
        findings: qa.findings,
        preflight_repairs_applied: preflightRepairs,
        repair_rounds: rounds,
      };
    }

    const repairOutcome = await repairDocumentData(doc, suggestions);
    const applied = repairOutcome.applied.filter((r) => r.applied).map((r) => r.repair);
    if (!applied.length) {
      return {
        ok: qa.ok,
        findings: qa.findings,
        preflight_repairs_applied: preflightRepairs,
        repair_rounds: rounds,
      };
    }

    if (repairOutcome.data_changed) {
      doc.document_version += 1;
      doc.status = "created";
      const snapshot = await saveVersionSnapshot(doc);
      doc.version_history.push(snapshot);
      await saveDocument(doc);
    }

    preflightRepairs.push(...applied);
    options.repairsApplied?.push(...applied);
    rounds += 1;

    const compiled = await deps.compile(documentId);
    if (!compiled.success) {
      return {
        ok: false,
        findings: lastFindings,
        preflight_repairs_applied: preflightRepairs,
        repair_rounds: rounds,
      };
    }
  }

  return {
    ok: !lastFindings.some((f) => f.severity === "error"),
    findings: lastFindings,
    preflight_repairs_applied: preflightRepairs,
    repair_rounds: rounds,
  };
}

function hasRepairableWarnings(findings: VisualQAFinding[]): boolean {
  const repairable = new Set([
    "cramped_layout",
    "possible_overflow",
    "blank_pages",
    "page_count_over_budget",
  ]);
  return findings.some((f) => f.severity === "warning" && repairable.has(f.check));
}

export function preflightFindingsAsLintIssues(findings: VisualQAFinding[]): LintIssue[] {
  return findings
    .filter((f) => f.severity === "error")
    .map((f) => ({
      check: f.check,
      severity: "error" as const,
      message: f.message,
      agent_action: f.agent_action,
    }));
}
