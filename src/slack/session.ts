import { randomUUID } from "node:crypto";
import type { ForgeBuildReceipt } from "../forge/receipt.js";
import type { IncidentSource } from "./gather/context.js";
import type { PricingRow } from "./gather/pricing.js";
import type { ProposalEvidenceSnippet, ProposalSource } from "./gather/proposal-context.js";

export type ResolvedIncidentSource = Exclude<IncidentSource, { kind: "unresolved" }>;
export type ResolvedProposalSource = Exclude<ProposalSource, { kind: "unresolved" }>;

export type PendingIncident = {
  id: string;
  source: ResolvedIncidentSource;
  transcript: string;
  templateId: string;
  draftData: Record<string, unknown>;
  filename: string;
  replyChannelId: string;
  threadTs: string;
  createdAt: number;
};

export type PendingProposal = {
  id: string;
  phase: "awaiting_pricing" | "awaiting_confirm";
  clientName: string;
  source: ResolvedProposalSource;
  transcript: string;
  requirements: string;
  contextLabel?: string;
  evidenceSnippets?: ProposalEvidenceSnippet[];
  pricingRows?: PricingRow[];
  draftData?: Record<string, unknown>;
  filename: string;
  replyChannelId: string;
  threadTs: string;
  createdAt: number;
};

export type PendingBoardPack = {
  id: string;
  period: string;
  csv: string;
  notes: string;
  draftData: Record<string, unknown>;
  filename: string;
  replyChannelId: string;
  threadTs: string;
  createdAt: number;
};

export type PendingStatus = {
  id: string;
  channelLabel: string;
  draftData: Record<string, unknown>;
  filename: string;
  replyChannelId: string;
  threadTs: string;
  createdAt: number;
};

export type PendingDraft = {
  id: string;
  templateId: string;
  templateLabel: string;
  draftData: Record<string, unknown>;
  filename: string;
  sourceText?: string;
  replyChannelId: string;
  threadTs: string;
  createdAt: number;
};

/**
 * A low-confidence draft awaiting a template choice. We hold the source text so
 * the picked template can be rebuilt from it, rather than guessing — the source
 * is never re-gathered, so the user's chosen shape is the only thing that changes.
 */
export type PendingDraftChoice = {
  id: string;
  sourceText: string;
  replyChannelId: string;
  threadTs: string;
  createdAt: number;
};

export type FinalizableWorkflow = "proposal" | "incident" | "board" | "draft" | "status";

/**
 * A delivered-but-DRAFT document held so the human can finalize it. Approving
 * re-exports the SAME data with the DRAFT mark removed and replaces the file —
 * no re-gather, so finalize can never introduce new/hallucinated content.
 */
export type FinalizableDocument = {
  id: string;
  workflow: FinalizableWorkflow;
  templateId: string;
  draftData: Record<string, unknown>;
  /** Clean (final) filename, e.g. "INC-042-Report.pdf". */
  filename: string;
  /** Slack file id of the uploaded DRAFT, deleted on finalize (best-effort). */
  draftFileId?: string;
  replyChannelId: string;
  threadTs: string;
  createdAt: number;
  /** Full build receipt from the draft compile — used to seal the final receipt. */
  buildReceipt?: ForgeBuildReceipt;
  /** Brand kit applied at compile (logo/colors/footer in theme.typ). */
  brandId?: string;
};

const TTL_MS = 30 * 60 * 1000;

type Tracked = { id: string; createdAt: number };

/**
 * A keyed store of pending entries with idle TTL and atomic claim-on-read. The
 * `take` operation removes the entry in the same step it returns it, so a
 * double-clicked "Approve" (or a redelivered Slack event) can never compile the
 * same draft twice. Used for the structurally-identical incident/board/draft
 * pending stores; proposal is bespoke (thread index + pricing phases).
 */
function createTtlStore<T extends Tracked>() {
  const entries = new Map<string, T>();
  const fresh = (entry: T | undefined): T | undefined =>
    entry && Date.now() - entry.createdAt <= TTL_MS ? entry : undefined;

  return {
    create(input: Omit<T, "id" | "createdAt">): T {
      const entry = { ...input, id: randomUUID(), createdAt: Date.now() } as T;
      entries.set(entry.id, entry);
      return entry;
    },
    get(id: string): T | undefined {
      const entry = fresh(entries.get(id));
      if (!entry) entries.delete(id);
      return entry;
    },
    take(id: string): T | undefined {
      const entry = fresh(entries.get(id));
      entries.delete(id);
      return entry;
    },
  };
}

const pendingProposals = new Map<string, PendingProposal>();
const proposalByThread = new Map<string, string>();
const finalizableDocs = new Map<string, FinalizableDocument>();
const finalizableByThread = new Map<string, string>();

function threadKey(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}

function pruneProposal(entry: PendingProposal | undefined): PendingProposal | undefined {
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > TTL_MS) {
    pendingProposals.delete(entry.id);
    proposalByThread.delete(threadKey(entry.replyChannelId, entry.threadTs));
    return undefined;
  }
  return entry;
}

const incidentStore = createTtlStore<PendingIncident>();
export const createPendingIncident = incidentStore.create;
export const getPendingIncident = incidentStore.get;
/**
 * Atomically claim a pending incident: returns it and removes it in one step so
 * a double-clicked "Approve" (or a Slack event redelivery) cannot compile twice.
 */
export const takePendingIncident = incidentStore.take;

export function createPendingProposal(
  input: Omit<PendingProposal, "id" | "createdAt">,
): PendingProposal {
  const entry: PendingProposal = {
    ...input,
    id: randomUUID(),
    createdAt: Date.now(),
  };
  pendingProposals.set(entry.id, entry);
  proposalByThread.set(threadKey(entry.replyChannelId, entry.threadTs), entry.id);
  return entry;
}

export function getPendingProposal(id: string): PendingProposal | undefined {
  return pruneProposal(pendingProposals.get(id));
}

export function getPendingProposalByThread(
  channelId: string,
  threadTs: string,
): PendingProposal | undefined {
  const id = proposalByThread.get(threadKey(channelId, threadTs));
  if (!id) return undefined;
  return getPendingProposal(id);
}

/** Fallback when Slack thread_ts does not match the stored anchor (or only one open request). */
export function findAwaitingPricingInChannel(channelId: string): PendingProposal | undefined {
  let found: PendingProposal | undefined;
  for (const entry of pendingProposals.values()) {
    const pending = pruneProposal(entry);
    if (!pending || pending.replyChannelId !== channelId) continue;
    if (pending.phase !== "awaiting_pricing") continue;
    if (found) return undefined;
    found = pending;
  }
  return found;
}

export function updatePendingProposal(
  id: string,
  update: (entry: PendingProposal) => PendingProposal,
): PendingProposal | undefined {
  const current = getPendingProposal(id);
  if (!current) return undefined;
  const next = update(current);
  pendingProposals.set(id, next);
  return next;
}

export function deletePendingProposal(id: string): void {
  const entry = pendingProposals.get(id);
  if (entry) {
    proposalByThread.delete(threadKey(entry.replyChannelId, entry.threadTs));
  }
  pendingProposals.delete(id);
}

/**
 * Atomically claim a confirmable proposal (must have draftData): returns it and
 * removes it so a double-click cannot compile/upload twice. Returns undefined if
 * absent, expired, or still awaiting pricing (not yet confirmable).
 */
export function takePendingProposalForConfirm(id: string): PendingProposal | undefined {
  const entry = getPendingProposal(id);
  if (!entry || !entry.draftData) return undefined;
  deletePendingProposal(id);
  return entry;
}

const boardPackStore = createTtlStore<PendingBoardPack>();
export const createPendingBoardPack = boardPackStore.create;
export const getPendingBoardPack = boardPackStore.get;
/** Atomically claim a pending board pack: returns it and removes it in one step. */
export const takePendingBoardPack = boardPackStore.take;

const statusStore = createTtlStore<PendingStatus>();
export const createPendingStatus = statusStore.create;
export const getPendingStatus = statusStore.get;
/** Atomically claim a pending status report: returns it and removes it in one step. */
export const takePendingStatus = statusStore.take;

const draftStore = createTtlStore<PendingDraft>();
export const createPendingDraft = draftStore.create;
export const getPendingDraft = draftStore.get;
/** Atomically claim a pending draft: returns it and removes it in one step. */
export const takePendingDraft = draftStore.take;

const draftChoiceStore = createTtlStore<PendingDraftChoice>();
export const createPendingDraftChoice = draftChoiceStore.create;
export const getPendingDraftChoice = draftChoiceStore.get;
/** Atomically claim a pending draft choice: returns it and removes it in one step. */
export const takePendingDraftChoice = draftChoiceStore.take;

export function createFinalizableDocument(
  input: Omit<FinalizableDocument, "id" | "createdAt">,
): FinalizableDocument {
  const entry: FinalizableDocument = { ...input, id: randomUUID(), createdAt: Date.now() };
  finalizableDocs.set(entry.id, entry);
  finalizableByThread.set(threadKey(input.replyChannelId, input.threadTs), entry.id);
  return entry;
}

/** Latest delivered PDF in a thread (for @forge details). */
export function getFinalizableForThread(
  channelId: string,
  threadTs: string,
): FinalizableDocument | undefined {
  const id = finalizableByThread.get(threadKey(channelId, threadTs));
  if (!id) return undefined;
  return getFinalizableDocument(id);
}

/**
 * Put back a claimed finalizable document when a non-destructive follow-up
 * action fails before replacing it. This preserves the existing Slack button
 * token, so the already-visible DRAFT can still be approved.
 */
export function restoreFinalizableDocument(entry: FinalizableDocument): void {
  if (Date.now() - entry.createdAt > TTL_MS) return;
  finalizableDocs.set(entry.id, entry);
}

/** Read a finalizable doc without claiming it (e.g. to pre-fill an edit modal). */
export function getFinalizableDocument(id: string): FinalizableDocument | undefined {
  const entry = finalizableDocs.get(id);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > TTL_MS) {
    finalizableDocs.delete(id);
    return undefined;
  }
  return entry;
}

/**
 * Atomically claim a finalizable document so a double-clicked "Approve" cannot
 * re-export/re-upload twice.
 */
export function takeFinalizableDocument(id: string): FinalizableDocument | undefined {
  const entry = finalizableDocs.get(id);
  if (!entry) return undefined;
  finalizableDocs.delete(id);
  if (Date.now() - entry.createdAt > TTL_MS) return undefined;
  return entry;
}

/** Drop a finalizable record without finalizing (e.g. "Needs changes"). */
export function discardFinalizableDocument(id: string): void {
  finalizableDocs.delete(id);
}
