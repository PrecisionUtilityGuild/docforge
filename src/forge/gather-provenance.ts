import type { ForgeGatherProvenance } from "./receipt.js";
import type {
  PendingBoardPack,
  PendingDraft,
  PendingIncident,
  PendingProposal,
  PendingStatus,
} from "../slack/session.js";

function auditFromDraftData(draftData: Record<string, unknown>): Partial<ForgeGatherProvenance> {
  const audit = draftData.source_audit as
    | {
        confidence?: unknown;
        evidence_count?: unknown;
        coverage?: unknown;
        warnings?: unknown;
      }
    | undefined;
  const evidence = draftData.evidence;
  const evidenceCount =
    typeof audit?.evidence_count === "number"
      ? audit.evidence_count
      : Array.isArray(evidence)
        ? evidence.length
        : undefined;

  return {
    evidence_count: evidenceCount,
    coverage: typeof audit?.coverage === "string" ? audit.coverage : undefined,
    confidence: typeof audit?.confidence === "string" ? audit.confidence : undefined,
    warnings: Array.isArray(audit?.warnings)
      ? audit.warnings.filter((w): w is string => typeof w === "string")
      : undefined,
  };
}

function hasUserNotes(notes: unknown): boolean {
  return typeof notes === "string" && notes.trim() !== "" && notes.trim() !== "CSV only";
}

function csvDraftProvenance(
  draftData: Record<string, unknown>,
  fieldName: "metrics" | "kpis",
): ForgeGatherProvenance {
  const rowCount = Array.isArray(draftData[fieldName]) ? draftData[fieldName].length : 0;
  const hasNotes = hasUserNotes(draftData.commentary);
  return {
    source_labels: ["CSV metrics", ...(hasNotes ? ["commentary"] : [])],
    source_count: rowCount + (hasNotes ? 1 : 0),
    gather_method: "csv_and_notes",
    ...auditFromDraftData(draftData),
  };
}

export function gatherProvenanceFromIncident(pending: PendingIncident): ForgeGatherProvenance {
  return {
    source_labels: [pending.source.label],
    source_count: pending.transcript.split(/\r?\n/).filter((l) => l.trim()).length,
    gather_method: pending.source.kind === "thread" ? "thread_history" : "channel_history",
    ...auditFromDraftData(pending.draftData),
  };
}

export function gatherProvenanceFromProposal(pending: PendingProposal): ForgeGatherProvenance {
  const lineCount = pending.transcript.split(/\r?\n/).filter((l) => l.trim()).length;
  return {
    source_labels: [pending.source.label, ...(pending.contextLabel ? [pending.contextLabel] : [])],
    source_count: lineCount,
    evidence_count: pending.evidenceSnippets?.length,
    gather_method: "rts_and_history",
    ...auditFromDraftData(pending.draftData ?? {}),
  };
}

export function gatherProvenanceFromBoard(pending: PendingBoardPack): ForgeGatherProvenance {
  const rowCount = Math.max(0, pending.csv.split(/\r?\n/).filter((l) => l.trim()).length - 1);
  const hasNotes = hasUserNotes(pending.notes);
  return {
    source_labels: ["CSV upload", ...(hasNotes ? ["founder notes"] : [])],
    source_count: rowCount + (hasNotes ? 1 : 0),
    gather_method: "csv_and_notes",
    ...auditFromDraftData(pending.draftData),
  };
}

export function gatherProvenanceFromStatus(pending: PendingStatus): ForgeGatherProvenance {
  return {
    source_labels: [pending.channelLabel],
    source_count:
      typeof pending.draftData.source_audit === "object" &&
      pending.draftData.source_audit !== null &&
      typeof (pending.draftData.source_audit as { evidence_count?: unknown }).evidence_count ===
        "number"
        ? ((pending.draftData.source_audit as { evidence_count: number }).evidence_count ?? 0)
        : 0,
    gather_method: "channel_history",
    ...auditFromDraftData(pending.draftData),
  };
}

export function gatherProvenanceFromDraft(pending: PendingDraft): ForgeGatherProvenance {
  if (pending.templateId === "monthly_metrics") {
    return csvDraftProvenance(pending.draftData, "metrics");
  }

  if (pending.templateId === "kpi_report") {
    return csvDraftProvenance(pending.draftData, "kpis");
  }

  return {
    source_labels: ["pasted notes / thread context"],
    source_count: 1,
    gather_method: "draft_inference",
    ...auditFromDraftData(pending.draftData),
  };
}
