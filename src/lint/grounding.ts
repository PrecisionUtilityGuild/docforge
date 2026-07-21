import type { LintIssue } from "./types.js";

/** Absolute-language phrases that need source backing on grounded templates. */
const UNSUPPORTED_CLAIM =
  /\b(definitely|guaranteed|always|100%|proven|without\s+(a\s+)?doubt|certainly|will\s+never|completely\s+eliminates?|no\s+risk)\b/i;

const GROUNDED_TEMPLATES = new Set([
  "project_status",
  "incident_report",
  "sales_proposal",
  "kpi_report",
  "postmortem",
]);

const NARRATIVE_FIELD =
  /(summary|executive_summary|abstract|body|body_md|commentary|root_cause|context|decision|consequences|notes|description|text)$/i;

function walkStrings(value: unknown, pathPrefix = "$"): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  if (typeof value === "string") {
    out.push({ path: pathPrefix, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => out.push(...walkStrings(item, `${pathPrefix}[${i}]`)));
  } else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      out.push(...walkStrings(v, `${pathPrefix}.${key}`));
    }
  }
  return out;
}

function isNarrativePath(loc: string): boolean {
  if (loc.includes(".evidence") || loc.includes("source_audit")) return false;
  const field =
    loc
      .split(".")
      .pop()
      ?.replace(/\[\d+\]$/, "") ?? "";
  return NARRATIVE_FIELD.test(field);
}

function hasEvidenceBacking(data: Record<string, unknown>): boolean {
  const evidence = data.evidence;
  if (Array.isArray(evidence) && evidence.length > 0) return true;
  if (typeof evidence === "string" && evidence.trim().length > 20) return true;
  return false;
}

function sourceAudit(data: Record<string, unknown>):
  | {
      confidence?: string;
      warnings?: string[];
      coverage?: Record<string, number>;
    }
  | undefined {
  const audit = data.source_audit;
  if (!audit || typeof audit !== "object") return undefined;
  return audit as {
    confidence?: string;
    warnings?: string[];
    coverage?: Record<string, number>;
  };
}

/**
 * Grounding lint: unsupported absolute claims, missing evidence for asserted facts,
 * and low source coverage on templates designed for Slack/context grounding.
 */
export function groundingChecks(templateId: string, data: Record<string, unknown>): LintIssue[] {
  if (!GROUNDED_TEMPLATES.has(templateId)) return [];

  const issues: LintIssue[] = [];
  const backed = hasEvidenceBacking(data);
  const audit = sourceAudit(data);

  for (const { path: loc, text } of walkStrings(data)) {
    if (!isNarrativePath(loc)) continue;
    const match = text.match(UNSUPPORTED_CLAIM);
    if (!match) continue;

    const severity = backed ? "info" : "warning";
    issues.push({
      check: "unsupported_claims",
      severity,
      message: `Unsupported absolute language ("${match[0]}") at ${loc}${backed ? "" : " without evidence backing"}.`,
      location: loc,
      agent_action: backed
        ? "Soften claim or cite the supporting evidence entry."
        : "Add evidence quotes from source material or rephrase without absolute guarantees.",
    });
  }

  if (templateId === "project_status") {
    const blockers = Array.isArray(data.blockers) ? data.blockers : [];
    const nextSteps = Array.isArray(data.next_steps) ? data.next_steps : [];
    const evidence = Array.isArray(data.evidence) ? data.evidence : [];

    if (blockers.length > 0) {
      const blockerEvidence = evidence.filter(
        (e) => (e as { type?: string }).type === "blocker",
      ).length;
      if (blockerEvidence === 0) {
        issues.push({
          check: "missing_blocker_evidence",
          severity: "warning",
          message: `${blockers.length} blocker(s) listed but no blocker evidence snippet captured.`,
          location: "$.evidence",
          agent_action:
            "Add evidence entries with type blocker quoting the Slack source, or remove ungrounded blockers.",
        });
      }
    }

    if (nextSteps.length > 0) {
      const stepEvidence = evidence.filter(
        (e) => (e as { type?: string }).type === "next_step",
      ).length;
      if (stepEvidence === 0) {
        issues.push({
          check: "missing_next_step_evidence",
          severity: "warning",
          message: `${nextSteps.length} next step(s) without a matching next_step evidence snippet.`,
          location: "$.evidence",
          agent_action: "Quote the source message that states each next step.",
        });
      }
    }

    if (audit?.confidence === "low") {
      issues.push({
        check: "source_coverage_low",
        severity: "warning",
        message: "Source audit confidence is low — status may not be fully grounded.",
        location: "$.source_audit.confidence",
        agent_action: "Gather more channel activity or add explicit evidence quotes before export.",
      });
    }

    for (const warning of audit?.warnings ?? []) {
      issues.push({
        check: "source_audit_warning",
        severity: "warning",
        message: warning,
        location: "$.source_audit.warnings",
        agent_action: "Resolve grounding gap noted in source_audit before external delivery.",
      });
    }

    const coverage = audit?.coverage;
    if (coverage && blockers.length > 0 && (coverage.blocker ?? 0) === 0) {
      issues.push({
        check: "blocker_coverage_gap",
        severity: "warning",
        message: "Blockers present but source coverage.blocker is zero.",
        location: "$.source_audit.coverage.blocker",
        agent_action: "Map each blocker to a quoted source line in evidence.",
      });
    }
  }

  if (templateId === "incident_report" && !backed) {
    const hasTimeline = Array.isArray(data.timeline) && data.timeline.length > 0;
    if (hasTimeline) {
      issues.push({
        check: "missing_evidence",
        severity: "warning",
        message: "Incident timeline present but evidence appendix is empty or thin.",
        location: "$.evidence",
        agent_action: "Add evidence citing Slack threads, tickets, or dashboards.",
      });
    }
  }

  return issues;
}

/**
 * Score 0–1 for how well narrative content is backed by evidence metadata.
 * Used by preflight and receipts — not a lint gate on its own.
 */
export function sourceCoverageScore(data: Record<string, unknown>): number {
  const audit = sourceAudit(data);
  if (audit?.confidence === "high") return 1;
  if (audit?.confidence === "medium") return 0.65;
  if (audit?.confidence === "low") return 0.35;

  const evidence = data.evidence;
  if (Array.isArray(evidence)) {
    if (evidence.length >= 5) return 0.9;
    if (evidence.length >= 2) return 0.7;
    if (evidence.length === 1) return 0.5;
    return 0.2;
  }
  if (typeof evidence === "string" && evidence.trim().length > 40) return 0.75;
  return 0.3;
}
