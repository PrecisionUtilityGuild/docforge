import {
  deleteAtPath,
  formatJsonPath,
  getAtPath,
  parseJsonPath,
  setAtPath,
  type JsonPathSegment,
} from "./paths.js";

export type RepairResult = {
  repair: string;
  applied: boolean;
  description: string;
  warning?: string;
};

function renameTopLevelKey(data: Record<string, unknown>, from: string, to: string): boolean {
  if (!(from in data) || to in data) return false;
  data[to] = data[from];
  delete data[from];
  return true;
}

function sectionArrayKey(data: Record<string, unknown>): string | undefined {
  for (const key of ["sections", "findings", "scope_items"]) {
    if (Array.isArray(data[key])) return key;
  }
  return undefined;
}

export function applyRenameField(data: Record<string, unknown>, spec: string): RepairResult {
  const match = spec.match(/^([^→]+)→(.+)$/);
  if (!match) {
    return {
      repair: `rename_field:${spec}`,
      applied: false,
      description: "Invalid rename_field syntax",
    };
  }
  const from = match[1]!.trim();
  const to = match[2]!.trim();

  if (from.startsWith("$.")) {
    const fromSegs = parseJsonPath(from);
    const toSegs = parseJsonPath(`$.${to}`);
    const value = getAtPath(data, fromSegs);
    if (value === undefined) {
      return {
        repair: `rename_field:${spec}`,
        applied: false,
        description: `Source path ${from} not found`,
      };
    }
    deleteAtPath(data, fromSegs);
    setAtPath(data, toSegs, value);
    return {
      repair: `rename_field:${spec}`,
      applied: true,
      description: `Moved ${from} to ${formatJsonPath(toSegs)}`,
    };
  }

  const applied = renameTopLevelKey(data, from, to);
  return {
    repair: `rename_field:${spec}`,
    applied,
    description: applied
      ? `Renamed top-level key '${from}' → '${to}'`
      : `Could not rename '${from}' → '${to}'`,
  };
}

export function applyAddDefault(data: Record<string, unknown>, spec: string): RepairResult {
  const [pathPart, ...valueParts] = spec.split("=");
  const defaultValue = valueParts.length > 0 ? valueParts.join("=") : undefined;
  const segments = parseJsonPath(pathPart!.startsWith("$") ? pathPart! : `$.${pathPart}`);
  const existing = getAtPath(data, segments);
  if (existing !== undefined && existing !== null && existing !== "") {
    return {
      repair: `add_default:${spec}`,
      applied: false,
      description: `${formatJsonPath(segments)} already has a value`,
    };
  }

  let value: unknown = defaultValue ?? "Untitled";
  const field = segments.at(-1);
  if (typeof field === "string") {
    if (field === "title") value = defaultValue ?? "Document";
    else if (field === "alt" || field === "alt_text") value = defaultValue ?? "Image";
    else if (field === "date") value = defaultValue ?? new Date().toISOString().slice(0, 10);
    else if (field === "body") value = defaultValue ?? "";
    else if (field === "severity") value = defaultValue ?? "medium";
  }

  setAtPath(data, segments, value);
  const warning =
    field === "alt" || field === "alt_text"
      ? "Placeholder alt text added — improve for accessibility."
      : undefined;
  return {
    repair: `add_default:${spec}`,
    applied: true,
    description: `Set ${formatJsonPath(segments)} to default value`,
    warning,
  };
}

export function applyRemoveEmptySection(data: Record<string, unknown>, spec: string): RepairResult {
  const index = Number(spec);
  const key = sectionArrayKey(data);
  if (!key || Number.isNaN(index)) {
    return {
      repair: `remove_empty_section:${spec}`,
      applied: false,
      description: "No section array found or invalid index",
    };
  }
  const sections = data[key] as unknown[];
  const section = sections[index] as Record<string, unknown> | undefined;
  if (!section) {
    return {
      repair: `remove_empty_section:${spec}`,
      applied: false,
      description: `Section index ${index} not found`,
    };
  }
  const body = section.body ?? section.description ?? section.text;
  if (typeof body === "string" && body.trim() !== "") {
    return {
      repair: `remove_empty_section:${spec}`,
      applied: false,
      description: `Section ${index} is not empty`,
    };
  }
  sections.splice(index, 1);
  return {
    repair: `remove_empty_section:${spec}`,
    applied: true,
    description: `Removed empty section at ${key}[${index}]`,
  };
}

export function applySplitWideTable(data: Record<string, unknown>, spec: string): RepairResult {
  const segments = parseJsonPath(spec.startsWith("$") ? spec : `$.${spec}`);
  const table = getAtPath(data, segments);
  if (!Array.isArray(table) || table.length <= 20) {
    return {
      repair: `split_wide_table:${spec}`,
      applied: false,
      description: "Table not found or too small to split",
    };
  }
  const chunkSize = 20;
  const chunks: unknown[][] = [];
  for (let i = 0; i < table.length; i += chunkSize) {
    chunks.push(table.slice(i, i + chunkSize));
  }
  const baseKey = String(segments.at(-1));
  const parentSegs = segments.slice(0, -1);
  const parent = getAtPath(data, parentSegs) as Record<string, unknown> | undefined;
  if (!parent || typeof parent !== "object") {
    return {
      repair: `split_wide_table:${spec}`,
      applied: false,
      description: "Could not locate table parent object",
    };
  }
  parent[baseKey] = chunks[0];
  for (let i = 1; i < chunks.length; i++) {
    parent[`${baseKey}_continued_${i}`] = chunks[i];
  }
  return {
    repair: `split_wide_table:${spec}`,
    applied: true,
    description: `Split table into ${chunks.length} chunks (max ${chunkSize} rows each)`,
    warning: "Split tables use _continued_N suffix keys — verify template renders all chunks.",
  };
}

export function applyTruncateString(data: Record<string, unknown>, spec: string): RepairResult {
  const [pathPart, maxStr] = spec.split(":");
  const maxLen = Number(maxStr ?? 500);
  const segments = parseJsonPath(pathPart!.startsWith("$") ? pathPart! : `$.${pathPart}`);
  const value = getAtPath(data, segments);
  if (typeof value !== "string" || value.length <= maxLen) {
    return {
      repair: `truncate_string:${spec}`,
      applied: false,
      description: "String not found or already within limit",
    };
  }
  setAtPath(data, segments, `${value.slice(0, maxLen - 1)}…`);
  return {
    repair: `truncate_string:${spec}`,
    applied: true,
    description: `Truncated ${formatJsonPath(segments)} to ${maxLen} chars`,
    warning: "Content was truncated — review for completeness.",
  };
}

export function applyAddDocumentTitle(data: Record<string, unknown>, spec: string): RepairResult {
  const titleKeys = ["title", "client", "period", "subject"];
  for (const key of titleKeys) {
    const val = data[key];
    if (typeof val === "string" && val.trim()) {
      return {
        repair: `add_document_title:${spec}`,
        applied: false,
        description: "Document already has a title field",
      };
    }
  }

  let title = spec.trim();
  if (!title) {
    const key = sectionArrayKey(data);
    const sections = key ? (data[key] as unknown[]) : [];
    const first = sections[0] as Record<string, unknown> | undefined;
    title =
      (typeof first?.title === "string" && first.title) ||
      (typeof data.summary === "string" && data.summary.slice(0, 60)) ||
      "Untitled Document";
  }

  data.title = title;
  return {
    repair: `add_document_title:${spec}`,
    applied: true,
    description: `Set title to '${title}'`,
    warning:
      title === "Untitled Document" ? "Generic title used — provide a specific title." : undefined,
  };
}

function walkForAlt(
  data: unknown,
  pathSegs: JsonPathSegment[] = [],
): JsonPathSegment[] | undefined {
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const found = walkForAlt(data[i], [...pathSegs, i]);
      if (found) return found;
    }
    return undefined;
  }
  if (!data || typeof data !== "object") return undefined;

  const obj = data as Record<string, unknown>;
  const hasImage =
    typeof obj.image === "string" ||
    typeof obj.src === "string" ||
    typeof obj.logo === "string" ||
    typeof obj.path === "string";
  const alt = obj.alt ?? obj.alt_text ?? obj.logo_alt;
  if (hasImage && (!alt || (typeof alt === "string" && alt.trim() === ""))) {
    return pathSegs;
  }

  for (const [key, value] of Object.entries(obj)) {
    const found = walkForAlt(value, [...pathSegs, key]);
    if (found) return found;
  }
  return undefined;
}

export function applyAddAltText(data: Record<string, unknown>, spec: string): RepairResult {
  const segments = spec
    ? parseJsonPath(spec.startsWith("$") ? spec : `$.${spec}`)
    : walkForAlt(data);
  if (!segments?.length) {
    return {
      repair: `add_alt_text:${spec}`,
      applied: false,
      description: "No image missing alt text found",
    };
  }
  const node = getAtPath(data, segments) as Record<string, unknown>;
  const caption = typeof node.caption === "string" ? node.caption : undefined;
  const alt = caption?.slice(0, 120) || "Document image";
  if ("alt" in node || "alt_text" in node) node.alt = alt;
  else if ("logo_alt" in node || typeof node.logo === "string") node.logo_alt = alt;
  else node.alt_text = alt;

  return {
    repair: `add_alt_text:${spec || formatJsonPath(segments)}`,
    applied: true,
    description: `Added generated alt text at ${formatJsonPath(segments)}`,
    warning: "Placeholder alt text — improve description for accessibility.",
  };
}

/**
 * No-op by design. DocForge hands all document data to Typst via `json()` and
 * renders it as `#data.field` — inside a JSON string value, `#`, `$`, and `\`
 * are LITERAL characters, not Typst markup (verified: such values compile
 * unchanged). Backslash-escaping them would corrupt correct content
 * ("C# developer" -> "C\\# developer" in the PDF) and is non-idempotent across
 * repair-loop re-runs. The only raw-Typst path (`typst_snippets`) already
 * rejects these characters via a deny-list before compile, so there is no code
 * path where escaping document data is correct.
 *
 * Kept in REPAIR_TRANSFORMS for contract stability and as a safe terminal in the
 * repair engine: it never mutates data, so a stale "escape_text" suggestion can
 * never damage a document.
 */
export function applyEscapeText(data: Record<string, unknown>, spec: string): RepairResult {
  void data;
  return {
    repair: `escape_text:${spec}`,
    applied: false,
    description:
      "No escaping applied — document data is rendered via Typst json(), where #, $ and \\ are literal. Malformed raw Typst belongs in typst_snippets (deny-listed), not escaped here.",
  };
}

function normalizeDateString(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return `${slash[3]}-${slash[1]!.padStart(2, "0")}-${slash[2]!.padStart(2, "0")}`;
  }

  const dash = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    return `${dash[3]}-${dash[1]!.padStart(2, "0")}-${dash[2]!.padStart(2, "0")}`;
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

export function applyNormalizeDates(data: Record<string, unknown>, spec: string): RepairResult {
  const dateFields = spec
    ? [parseJsonPath(spec.startsWith("$") ? spec : `$.${spec}`)]
    : (["date", "period", "report_date", "due"] as const).map((f) => parseJsonPath(`$.${f}`));

  let count = 0;
  for (const segments of dateFields) {
    const value = getAtPath(data, segments);
    if (typeof value !== "string") continue;
    const normalized = normalizeDateString(value);
    if (normalized && normalized !== value) {
      setAtPath(data, segments, normalized);
      count++;
    }
  }

  return {
    repair: `normalize_dates:${spec}`,
    applied: count > 0,
    description:
      count > 0
        ? `Normalized ${count} date field(s) to ISO format`
        : "No date fields needed normalization",
  };
}

export function applyReflowSections(data: Record<string, unknown>, spec: string): RepairResult {
  const max = Number(spec) || 6;
  const key = sectionArrayKey(data);
  if (!key) {
    return {
      repair: `reflow_sections:${spec}`,
      applied: false,
      description: "No sections array to reflow",
    };
  }
  const sections = data[key] as unknown[];
  if (sections.length <= max) {
    return {
      repair: `reflow_sections:${spec}`,
      applied: false,
      description: `Sections (${sections.length}) within limit ${max}`,
    };
  }
  const kept = sections.slice(0, max);
  const overflow = sections.slice(max);
  data[key] = kept;
  const appendix = (data.appendix as unknown[]) ?? [];
  appendix.push({
    title: "Overflow Sections",
    body: overflow
      .map((s) => {
        const sec = s as Record<string, unknown>;
        return `${sec.title ?? "Section"}: ${sec.body ?? sec.description ?? ""}`;
      })
      .join("\n\n"),
  });
  data.appendix = appendix;
  return {
    repair: `reflow_sections:${spec}`,
    applied: true,
    description: `Moved ${overflow.length} section(s) to appendix`,
    warning: "Review appendix content after reflow_sections repair.",
  };
}

export const REPAIR_TRANSFORMS = [
  "rename_field",
  "add_default",
  "remove_empty_section",
  "split_wide_table",
  "truncate_string",
  "add_document_title",
  "add_alt_text",
  "escape_text",
  "normalize_dates",
  "reflow_sections",
] as const;

export type RepairTransform = (typeof REPAIR_TRANSFORMS)[number];
