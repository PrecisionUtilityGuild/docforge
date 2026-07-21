import type { LintIssue } from "../lint/engine.js";
import { analyzeLayoutHeuristics } from "../layout/heuristics.js";
import type { DocumentRecord } from "../types.js";

export type VisualQAFinding = {
  check: string;
  severity: "error" | "warning" | "info";
  message: string;
  page?: number;
  agent_action: string;
  lint_missed: boolean;
};

export async function runVisualQA(
  doc: DocumentRecord,
  lintIssues: LintIssue[] = [],
): Promise<{ ok: boolean; findings: VisualQAFinding[] }> {
  const findings: VisualQAFinding[] = [];
  const previews = doc.artifacts.previews ?? [];
  const lastCompile = doc.compile_history.at(-1);
  const pageCount = lastCompile?.page_count ?? previews.length;

  const layoutIssues = previews.length ? await analyzeLayoutHeuristics(previews, pageCount) : [];

  for (const issue of layoutIssues) {
    const lintHad = lintIssues.some((l) => l.check === issue.check);
    findings.push({
      check: issue.check,
      severity: issue.severity,
      message: issue.message,
      page: issue.location?.match(/preview-(\d+)/)?.[1]
        ? Number(issue.location.match(/preview-(\d+)/)![1])
        : undefined,
      agent_action: issue.agent_action ?? "Review preview and adjust layout.",
      lint_missed: !lintHad,
    });
  }

  const ok = !findings.some((f) => f.severity === "error");
  return { ok, findings };
}
