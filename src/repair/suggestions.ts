import type { ErrorObject } from "ajv";
import type { Diagnostic } from "../errors.js";
import type { LintIssue } from "../lint/types.js";
import type { VisualQAFinding } from "../qa/visual.js";
import type { DocumentRecord } from "../types.js";

export function suggestRepairsFromDiagnostic(diagnostic: Diagnostic): string[] {
  const suggestions: string[] = [];
  const msg = diagnostic.message.toLowerCase();
  const path = diagnostic.location?.path ?? diagnostic.location?.field ?? "";

  if (diagnostic.error_type === "schema_error") {
    if (/required|missing/i.test(msg)) {
      if (/title/i.test(msg) || path.includes("title")) {
        suggestions.push("add_document_title:");
      }
      const sectionMatch = path.match(/sections\[(\d+)\]/);
      if (sectionMatch) {
        suggestions.push(`add_default:sections[${sectionMatch[1]}].title`);
      }
      if (/alt/i.test(msg)) {
        suggestions.push(`add_alt_text:${path || ""}`);
      }
    }
    if (/additional properties|must NOT have/i.test(msg)) {
      const fieldMatch = msg.match(/property ['"]([^'"]+)['"]/);
      if (fieldMatch) {
        suggestions.push(`rename_field:${fieldMatch[1]}→`);
      }
    }
  }

  if (diagnostic.error_type === "compile_error") {
    if (/unknown variable/i.test(msg)) {
      const varMatch = diagnostic.message.match(/[`']([^`']+)[`']/);
      if (varMatch) {
        suggestions.push(`rename_field:${varMatch[1]}→`);
      } else {
        suggestions.push("rename_field:oldKey→newKey");
      }
    }
    if (/file not found|asset/i.test(msg)) {
      suggestions.push("remove_empty_section:0");
    }
  }

  if (diagnostic.suggested_repairs?.length) {
    suggestions.push(...diagnostic.suggested_repairs);
  }

  return [...new Set(suggestions)];
}

export function suggestRepairsFromAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  const suggestions: string[] = [];
  for (const err of errors ?? []) {
    const field = err.instancePath || err.params?.missingProperty;
    if (err.keyword === "required" && typeof err.params?.missingProperty === "string") {
      const prop = err.params.missingProperty;
      if (prop === "title") suggestions.push("add_document_title:");
      else suggestions.push(`add_default:${prop}`);
    }
    if (field && /sections\[\d+\]/.test(String(field))) {
      const m = String(field).match(/sections\[(\d+)\]/);
      if (m && err.message?.includes("title")) {
        suggestions.push(`add_default:sections[${m[1]}].title`);
      }
    }
  }
  return [...new Set(suggestions)];
}

export function suggestRepairsFromLintIssues(issues: LintIssue[]): string[] {
  const suggestions: string[] = [];
  for (const issue of issues) {
    switch (issue.check) {
      case "missing_document_title":
        suggestions.push("add_document_title:");
        break;
      case "empty_sections": {
        const m = issue.location?.match(/\[(\d+)\]/);
        if (m) suggestions.push(`remove_empty_section:${m[1]}`);
        break;
      }
      case "missing_alt_text":
        suggestions.push(`add_alt_text:${issue.location ?? ""}`);
        break;
      case "page_count_over_budget":
        suggestions.push("truncate_string:$.summary:300");
        break;
      case "heading_hierarchy":
        suggestions.push("add_default:sections[0].heading_level=1");
        break;
      case "cramped_layout":
      case "possible_overflow":
        suggestions.push("reflow_sections:5");
        suggestions.push("truncate_string:$.summary:350");
        suggestions.push("truncate_string:$.executive_summary:350");
        break;
      case "blank_pages":
        suggestions.push("remove_empty_section:0");
        break;
      default:
        break;
    }
  }
  return [...new Set(suggestions)];
}

const PREFLIGHT_REPAIRABLE = new Set([
  "cramped_layout",
  "possible_overflow",
  "blank_pages",
  "page_count_over_budget",
]);

/**
 * Map visual preflight findings to deterministic data repairs. Only returns
 * repairs the engine can apply without hallucinating new content.
 */
export function suggestRepairsFromVisualFindings(
  findings: VisualQAFinding[],
  doc: DocumentRecord,
): string[] {
  const suggestions: string[] = [];
  const data = doc.data;

  for (const finding of findings) {
    if (finding.severity === "info") continue;
    if (!PREFLIGHT_REPAIRABLE.has(finding.check)) continue;

    switch (finding.check) {
      case "cramped_layout":
      case "possible_overflow":
        if (Array.isArray(data.sections) && data.sections.length > 4) {
          suggestions.push("reflow_sections:4");
        }
        if (typeof data.summary === "string" && data.summary.length > 400) {
          suggestions.push("truncate_string:$.summary:400");
        }
        if (typeof data.executive_summary === "string" && data.executive_summary.length > 400) {
          suggestions.push("truncate_string:$.executive_summary:400");
        }
        if (Array.isArray(data.kpis) && data.kpis.length > 12) {
          suggestions.push("split_wide_table:$.kpis");
        }
        break;
      case "blank_pages":
        suggestions.push("remove_empty_section:0");
        break;
      case "page_count_over_budget":
        suggestions.push("truncate_string:$.summary:280");
        suggestions.push("reflow_sections:4");
        break;
      default:
        break;
    }
  }

  return [...new Set(suggestions)];
}
