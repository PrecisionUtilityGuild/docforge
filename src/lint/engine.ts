import { readFile } from "node:fs/promises";
import path from "node:path";
import { getTemplate } from "../templates/registry.js";
import type { DocumentRecord, TemplateMeta } from "../types.js";
import type { LintIssue, LintSeverity } from "./types.js";
import { groundingChecks } from "./grounding.js";
export type { LintIssue, LintSeverity } from "./types.js";

type LintRule = {
  id: string;
  severity: LintSeverity;
  rule: string;
};

type LintRulesFile = {
  checks: LintRule[];
};

const TODO_PATTERN = /\b(TODO|TBD|FIXME|XXX)\b/i;

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

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function applyTemplateRule(rule: LintRule, data: Record<string, unknown>): LintIssue | undefined {
  if (rule.id === "executive_summary_length" && typeof data.summary === "string") {
    const count = wordCount(data.summary);
    const match = rule.rule.match(/between (\d+) and (\d+)/i);
    if (match) {
      const min = Number(match[1]);
      const max = Number(match[2]);
      if (count < min || count > max) {
        return {
          check: rule.id,
          severity: rule.severity,
          message: `Summary is ${count} words; expected ${min}–${max}.`,
          location: "$.summary",
          agent_action: `Adjust summary length to ${min}–${max} words.`,
        };
      }
    }
  }

  if (rule.id === "risks_have_mitigations" && Array.isArray(data.risks)) {
    for (let i = 0; i < data.risks.length; i++) {
      const risk = data.risks[i] as Record<string, unknown>;
      if (risk.severity === "high" && !risk.mitigation) {
        return {
          check: rule.id,
          severity: rule.severity,
          message: `High-severity risk at index ${i} lacks mitigation.`,
          location: `$.risks[${i}]`,
          agent_action: "Add a mitigation field for each high-severity risk.",
        };
      }
    }
  }

  if (rule.id === "abstract_length" && typeof data.abstract === "string") {
    const count = wordCount(data.abstract);
    const match = rule.rule.match(/between (\d+) and (\d+)/i);
    if (match) {
      const min = Number(match[1]);
      const max = Number(match[2]);
      if (count < min || count > max) {
        return {
          check: rule.id,
          severity: rule.severity,
          message: `Abstract is ${count} words; expected ${min}–${max}.`,
          location: "$.abstract",
          agent_action: `Adjust abstract length to ${min}–${max} words.`,
        };
      }
    }
  }

  if (rule.id === "timeline_has_events" && Array.isArray(data.timeline)) {
    if (data.timeline.length < 2) {
      return {
        check: rule.id,
        severity: rule.severity,
        message: "Incident timeline should include at least 2 events.",
        location: "$.timeline",
        agent_action: "Add timeline events with time and description.",
      };
    }
  }

  if (rule.id === "kpis_have_targets" && Array.isArray(data.kpis)) {
    const missing = data.kpis.filter((k) => !(k as Record<string, unknown>).target).length;
    if (missing > 0) {
      return {
        check: rule.id,
        severity: rule.severity,
        message: `${missing} KPI(s) missing target values.`,
        location: "$.kpis",
        agent_action: "Add target field for each KPI where applicable.",
      };
    }
  }

  if (rule.id === "pricing_has_total" && data.pricing && typeof data.pricing === "object") {
    const pricing = data.pricing as Record<string, unknown>;
    if (!pricing.total && !pricing.total_amount) {
      return {
        check: rule.id,
        severity: rule.severity,
        message: "Pricing section missing total amount.",
        location: "$.pricing",
        agent_action: "Add pricing.total or pricing.total_amount.",
      };
    }
  }

  return undefined;
}

function accessibilityChecks(data: Record<string, unknown>, accessibility: boolean): LintIssue[] {
  if (!accessibility) return [];
  const issues: LintIssue[] = [];

  function walkImages(value: unknown, loc: string): void {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walkImages(item, `${loc}[${i}]`));
      return;
    }
    if (!value || typeof value !== "object") return;

    const obj = value as Record<string, unknown>;
    const hasImageRef =
      typeof obj.image === "string" ||
      typeof obj.src === "string" ||
      typeof obj.logo === "string" ||
      typeof obj.path === "string";
    const alt = obj.alt ?? obj.alt_text ?? obj.logo_alt;

    if (hasImageRef && (!alt || (typeof alt === "string" && alt.trim() === ""))) {
      issues.push({
        check: "missing_alt_text",
        severity: "error",
        message: `Image/figure at ${loc} missing alt text.`,
        location: loc,
        agent_action: "Add alt or alt_text describing the image for accessibility.",
      });
    }

    for (const [key, v] of Object.entries(obj)) {
      walkImages(v, `${loc}.${key}`);
    }
  }

  walkImages(data, "$");

  const sections = data.sections;
  if (Array.isArray(sections)) {
    let lastLevel = 0;
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i] as Record<string, unknown>;
      const level = typeof sec.heading_level === "number" ? sec.heading_level : 2;
      if (lastLevel > 0 && level > lastLevel + 1) {
        issues.push({
          check: "heading_hierarchy",
          severity: "error",
          message: `Section ${i} skips heading level (${lastLevel} → ${level}).`,
          location: `$.sections[${i}].heading_level`,
          agent_action: "Use sequential heading levels without skipping (e.g. 1 → 2, not 1 → 3).",
        });
      }
      lastLevel = level;
    }
  }

  return issues;
}

function genericChecks(
  data: Record<string, unknown>,
  meta: TemplateMeta,
  pageCount?: number,
): LintIssue[] {
  const issues: LintIssue[] = [];

  const title = data.title ?? data.client ?? data.period;
  if (!title || (typeof title === "string" && title.trim() === "")) {
    issues.push({
      check: "missing_document_title",
      severity: "error",
      message: "Document is missing a title (or primary identifier field).",
      location: "$.title",
      agent_action: "Set title (or template-specific primary field) before export.",
    });
  }

  for (const { path: loc, text } of walkStrings(data)) {
    if (TODO_PATTERN.test(text)) {
      issues.push({
        check: "todo_placeholders",
        severity: "warning",
        message: `Placeholder text found at ${loc}.`,
        location: loc,
        agent_action: "Replace TODO/TBD/FIXME markers with final content.",
      });
    }
  }

  const sectionArrays = ["sections", "findings", "scope_items"].flatMap((key) => {
    const val = data[key];
    return Array.isArray(val) ? val.map((s, i) => ({ key, index: i, item: s })) : [];
  });

  for (const { key, index, item } of sectionArrays) {
    const section = item as Record<string, unknown>;
    const body = section.body ?? section.description ?? section.text;
    if (typeof body === "string" && body.trim() === "") {
      issues.push({
        check: "empty_sections",
        severity: "warning",
        message: `Empty body in ${key}[${index}].`,
        location: `$.${key}[${index}]`,
        agent_action: "Fill section body or remove the empty section.",
      });
    }
  }

  if (pageCount !== undefined && pageCount > meta.page_budget.max) {
    issues.push({
      check: "page_count_over_budget",
      severity: "warning",
      message: `Document has ${pageCount} pages; budget max is ${meta.page_budget.max}.`,
      agent_action: "Reduce content or split into appendix to fit page budget.",
    });
  }

  return issues;
}

export async function lintDocumentData(
  templateId: string,
  data: Record<string, unknown>,
  pageCount?: number,
  accessibility = true,
): Promise<{ ok: boolean; issues: LintIssue[] }> {
  const { meta, dir } = await getTemplate(templateId);
  const issues = [
    ...genericChecks(data, meta, pageCount),
    ...accessibilityChecks(data, accessibility),
    ...groundingChecks(templateId, data),
  ];

  try {
    const rulesRaw = await readFile(path.join(dir, "lint_rules.json"), "utf8");
    const rules = JSON.parse(rulesRaw) as LintRulesFile;
    for (const rule of rules.checks ?? []) {
      const issue = applyTemplateRule(rule, data);
      if (issue) issues.push(issue);
    }
  } catch {
    // no lint_rules.json
  }

  const ok = !issues.some((i) => i.severity === "error");
  return { ok, issues };
}

export async function lintDocument(doc: DocumentRecord): Promise<{
  ok: boolean;
  document_id: string;
  issues: LintIssue[];
}> {
  const lastCompile = doc.compile_history.at(-1);
  const pageCount = lastCompile?.success ? lastCompile.page_count : undefined;
  const accessibility = doc.options.accessibility ?? true;
  const { ok, issues } = await lintDocumentData(
    doc.template_id,
    doc.data,
    pageCount,
    accessibility,
  );
  return { ok, document_id: doc.document_id, issues };
}
