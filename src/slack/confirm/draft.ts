const DRAFT_PREFIX = "DRAFT — ";

/**
 * Mark a document's title as a DRAFT. Every Forge document is machine-assembled
 * from Slack context, so until a human approves it the exported PDF carries a
 * visible DRAFT mark. Idempotent — marking an already-marked title is a no-op.
 */
export function markTitleDraft(data: Record<string, unknown>): Record<string, unknown> {
  const title = typeof data.title === "string" ? data.title : "Document";
  if (title.startsWith(DRAFT_PREFIX)) return data;
  return { ...data, title: `${DRAFT_PREFIX}${title}` };
}

/**
 * Draft-only fields per workflow: useful for reviewing the draft (provenance —
 * "did Forge read the right source?") but noise in the client-facing final, so
 * they are stripped on finalize. All must be schema-OPTIONAL.
 */
const DRAFT_ONLY_FIELDS: Record<string, readonly string[]> = {
  proposal: ["discovery_notes"],
};

/**
 * Remove the DRAFT mark on finalize, and drop workflow-specific draft-only
 * fields (e.g. the proposal's raw discovery_notes). Idempotent — safe on a
 * title that was never marked. We add NO new field: schemas are strict
 * (additionalProperties: false), and approval state is expressed purely by the
 * DRAFT prefix being absent.
 */
export function finalizeData(
  data: Record<string, unknown>,
  workflow?: string,
): Record<string, unknown> {
  const title = typeof data.title === "string" ? data.title : "Document";
  const finalTitle = title.startsWith(DRAFT_PREFIX) ? title.slice(DRAFT_PREFIX.length) : title;
  const next: Record<string, unknown> = { ...data, title: finalTitle };
  for (const field of (workflow && DRAFT_ONLY_FIELDS[workflow]) || []) {
    delete next[field];
  }
  return next;
}

/** @deprecated use finalizeData — kept for callers that only need the title strip. */
export function finalizeTitle(data: Record<string, unknown>): Record<string, unknown> {
  return finalizeData(data);
}

export function isDraftTitle(title: unknown): boolean {
  return typeof title === "string" && title.startsWith(DRAFT_PREFIX);
}

/**
 * Filename for the DRAFT upload — "INC-042-Report.pdf" → "INC-042-Report-DRAFT.pdf".
 * The final upload keeps the clean name, so even if the draft file can't be
 * deleted on finalize, the two are unambiguous in the thread.
 */
export function draftFilename(filename: string): string {
  return filename.replace(/(\.[a-z0-9]+)?$/i, (ext) => `-DRAFT${ext || ""}`);
}
