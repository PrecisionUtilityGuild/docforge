import { writeDocumentData } from "../sandbox/workspace.js";
import type { DocumentRecord } from "../types.js";
import {
  applyAddAltText,
  applyAddDefault,
  applyAddDocumentTitle,
  applyEscapeText,
  applyNormalizeDates,
  applyReflowSections,
  applyRemoveEmptySection,
  applyRenameField,
  applySplitWideTable,
  applyTruncateString,
  REPAIR_TRANSFORMS,
  type RepairResult,
  type RepairTransform,
} from "./transforms.js";

export type RepairApplyOutcome = {
  document_id: string;
  applied: RepairResult[];
  skipped: RepairResult[];
  warnings: string[];
  data_changed: boolean;
};

function parseRepairToken(token: string): { transform: RepairTransform; spec: string } | null {
  const colon = token.indexOf(":");
  if (colon <= 0) return null;
  const transform = token.slice(0, colon) as RepairTransform;
  if (!REPAIR_TRANSFORMS.includes(transform)) return null;
  return { transform, spec: token.slice(colon + 1) };
}

function applyTransform(
  data: Record<string, unknown>,
  transform: RepairTransform,
  spec: string,
): RepairResult {
  switch (transform) {
    case "rename_field":
      return applyRenameField(data, spec);
    case "add_default":
      return applyAddDefault(data, spec);
    case "remove_empty_section":
      return applyRemoveEmptySection(data, spec);
    case "split_wide_table":
      return applySplitWideTable(data, spec);
    case "truncate_string":
      return applyTruncateString(data, spec);
    case "add_document_title":
      return applyAddDocumentTitle(data, spec);
    case "add_alt_text":
      return applyAddAltText(data, spec);
    case "escape_text":
      return applyEscapeText(data, spec);
    case "normalize_dates":
      return applyNormalizeDates(data, spec);
    case "reflow_sections":
      return applyReflowSections(data, spec);
    default:
      return { repair: `${transform}:${spec}`, applied: false, description: "Unknown transform" };
  }
}

export async function repairDocumentData(
  doc: DocumentRecord,
  repairs: string[],
): Promise<RepairApplyOutcome> {
  const data = structuredClone(doc.data) as Record<string, unknown>;
  const applied: RepairResult[] = [];
  const skipped: RepairResult[] = [];
  const warnings: string[] = [];
  let dataChanged = false;

  for (const token of repairs) {
    const parsed = parseRepairToken(token.trim());
    if (!parsed) {
      skipped.push({
        repair: token,
        applied: false,
        description: "Invalid repair token format",
      });
      continue;
    }

    const result = applyTransform(data, parsed.transform, parsed.spec);
    if (result.applied) {
      applied.push(result);
      dataChanged = true;
      if (result.warning) warnings.push(result.warning);
    } else {
      skipped.push(result);
    }
  }

  if (dataChanged) {
    doc.data = data;
    doc.updated_at = new Date().toISOString();
    await writeDocumentData(doc.workspace_path, data);
  }

  return {
    document_id: doc.document_id,
    applied,
    skipped,
    warnings,
    data_changed: dataChanged,
  };
}
