import type { KnownBlock, View } from "@slack/web-api";
import type { FinalizableWorkflow } from "../session.js";
import { isDraftTitle } from "./draft.js";

export const EDIT_MODAL_CALLBACK = "forge_edit_modal";

/**
 * The editable, human-facing top-level fields per workflow. We deliberately
 * expose only safe scalar strings — never the structured/computed data
 * (pricing totals, KPI numbers, timelines) which stay grounded in source and
 * must not be hand-overwritten in a modal.
 */
type EditField = { key: string; label: string; multiline?: boolean; optional?: boolean };

const FIELDS: Record<FinalizableWorkflow, EditField[]> = {
  incident: [
    { key: "title", label: "Title" },
    { key: "severity", label: "Severity (critical/high/medium/low)" },
    { key: "summary", label: "Summary", multiline: true },
    { key: "root_cause", label: "Root cause", multiline: true, optional: true },
  ],
  proposal: [
    { key: "title", label: "Title" },
    { key: "executive_summary", label: "Executive summary", multiline: true },
  ],
  board: [
    { key: "title", label: "Title" },
    { key: "summary", label: "Summary", multiline: true },
    { key: "commentary", label: "Commentary", multiline: true, optional: true },
  ],
  status: [
    { key: "title", label: "Title" },
    { key: "period", label: "Period" },
    { key: "summary", label: "Summary", multiline: true },
  ],
  draft: [{ key: "title", label: "Title" }],
};

const DRAFT_SAFE_SCALAR_FIELDS: EditField[] = [
  { key: "summary", label: "Summary", multiline: true },
  { key: "body_md", label: "Body", multiline: true },
  { key: "abstract", label: "Abstract", multiline: true },
  { key: "context", label: "Context", multiline: true },
  { key: "decision", label: "Decision", multiline: true },
  { key: "consequences", label: "Consequences", multiline: true },
  { key: "objective", label: "Objective", multiline: true },
  { key: "background", label: "Background", multiline: true },
];

function editableFields(
  workflow: FinalizableWorkflow,
  draftData: Record<string, unknown>,
): EditField[] {
  const base = FIELDS[workflow];
  if (workflow !== "draft") return base;

  const safeExisting = DRAFT_SAFE_SCALAR_FIELDS.filter((field) => {
    const value = draftData[field.key];
    return typeof value === "string" && value.trim().length > 0;
  });
  return [...base, ...safeExisting];
}

/** Strip a leading "DRAFT — " so the editor sees the clean title to edit. */
function displayTitle(value: unknown): string {
  const s = typeof value === "string" ? value : "";
  return isDraftTitle(s) ? s.replace(/^DRAFT — /, "") : s;
}

function blockId(key: string): string {
  return `edit_${key}`;
}

export function buildEditModal(input: {
  finalizeId: string;
  workflow: FinalizableWorkflow;
  draftData: Record<string, unknown>;
}): View {
  const fields = editableFields(input.workflow, input.draftData);
  const blocks: KnownBlock[] = fields.map((f) => {
    const raw = f.key === "title" ? displayTitle(input.draftData.title) : input.draftData[f.key];
    const initial = typeof raw === "string" ? raw : "";
    return {
      type: "input",
      block_id: blockId(f.key),
      optional: f.optional ?? false,
      label: { type: "plain_text", text: f.label },
      element: {
        type: "plain_text_input",
        action_id: "value",
        multiline: f.multiline ?? false,
        ...(initial ? { initial_value: initial } : {}),
      },
    };
  });

  return {
    type: "modal",
    callback_id: EDIT_MODAL_CALLBACK,
    private_metadata: input.finalizeId,
    title: { type: "plain_text", text: "Edit draft" },
    submit: { type: "plain_text", text: "Save & re-export" },
    close: { type: "plain_text", text: "Cancel" },
    blocks,
  };
}

/**
 * Apply the modal's edited values back onto the draft data. Only the exposed
 * fields are touched; everything else (grounded/structured data) is preserved
 * byte-for-byte. Returns the merged data — still to be re-marked DRAFT and
 * re-exported by the caller.
 */
export function applyEditValues(input: {
  workflow: FinalizableWorkflow;
  draftData: Record<string, unknown>;
  values: Record<string, Record<string, { value?: string }>>;
}): Record<string, unknown> {
  const next: Record<string, unknown> = { ...input.draftData };
  for (const f of editableFields(input.workflow, input.draftData)) {
    const submitted = input.values[blockId(f.key)]?.value?.value;
    if (submitted === undefined) continue;
    const trimmed = submitted.trim();
    if (f.optional && trimmed === "") {
      delete next[f.key];
      continue;
    }
    next[f.key] = trimmed;
  }
  return next;
}
