import { discoveryToSalesProposal } from "../../service.js";
import { buildPricingPromptBlocks } from "../confirm/pricing-prompt.js";
import { buildProposalConfirmBlocks } from "../confirm/proposal.js";
import { postConfirmPreview } from "../confirm/preview.js";
import { setWorkflowStatus, setWorkflowTitle } from "../agent/status.js";
import { proposalPdfFilename } from "../gather/channels.js";
import { parsePricingLines, type PricingRow } from "../gather/pricing.js";
import {
  assessProposalTranscript,
  extractRequirements,
  inferProposalTimeline,
  proposalDiscoveryHighlights,
  proposalEvidenceSnippets,
  resolveClientDisplayName,
  resolveProposalSource,
} from "../gather/proposal-context.js";
import { gatherProposalContext } from "../gather/rts.js";
import { formatSlackApiError } from "../errors.js";
import { createPendingProposal, updatePendingProposal } from "../session.js";
import { markTitleDraft } from "../confirm/draft.js";
import type { ForgeMessageContext } from "../types.js";

type ProposalGatherMeta = {
  method: "rts" | "history_fallback";
  label: string;
  rtsAttempted: boolean;
  fallbackReason?: string;
};

/**
 * Turn a scope item into a noun phrase that reads after "covering …". Gerund-ify
 * a leading base verb ("integrate the company" → "integrating the company") so
 * we never produce "covering integrate …".
 */
function scopePhrase(item: string): string {
  const base = item
    .replace(/[.]+$/, "")
    .replace(/^(?:to|we|they)\s+/i, "")
    .trim();
  const gerund = base.replace(/^([a-z]+)\b/i, (verb) => GERUND[verb.toLowerCase()] ?? verb);
  return gerund.charAt(0).toLowerCase() + gerund.slice(1);
}

const GERUND: Record<string, string> = {
  integrate: "integrating",
  migrate: "migrating",
  build: "building",
  implement: "implementing",
  deploy: "deploying",
  deliver: "delivering",
  provide: "providing",
  configure: "configuring",
  automate: "automating",
  consolidate: "consolidating",
};

/**
 * A clean executive summary: lead with the client and a short, readable list of
 * the scope areas (as noun phrases), then the engagement framing. Falls back to
 * a generic-but-correct line when scope is thin.
 */
function buildExecutiveSummary(client: string, scope: Array<{ item: string }>): string {
  const phrases = scope
    .slice(0, 3)
    .map((row) => scopePhrase(row.item))
    .filter((p) => p.length > 0);

  const closing =
    "Forge will deliver this through a phased engagement with explicit scope, timeline, and pricing gates.";

  if (phrases.length === 0) {
    return `This proposal sets out Forge's recommended approach for ${client}. ${closing}`;
  }
  const list =
    phrases.length === 1
      ? phrases[0]
      : `${phrases.slice(0, -1).join("; ")}; and ${phrases[phrases.length - 1]}`;
  return `This proposal outlines Forge's engagement for ${client}, covering ${list}. ${closing}`;
}

function diagramFromTimeline(timeline: Array<{ phase: string }>): Record<string, unknown> {
  const nodes = timeline.map((t, i) => {
    const short = t.phase.split(/\s*&\s*/)[0]?.trim() ?? t.phase;
    const label = short.split(/\s+/).slice(0, 2).join(" ") || `Phase ${i + 1}`;
    return { id: `phase${i}`, label };
  });
  const edges = nodes.slice(1).map((_, i) => [`phase${i}`, `phase${i + 1}`]);
  return {
    type: "process",
    title: "Delivery Process",
    nodes,
    edges,
  };
}

export function buildProposalDraft(
  clientName: string,
  transcript: string,
  requirements: string,
  pricingRows: PricingRow[],
): Record<string, unknown> {
  const data = discoveryToSalesProposal(transcript, requirements, pricingRows);
  const displayName = resolveClientDisplayName(clientName, transcript);
  const client = data.client as Record<string, unknown>;
  const scope = requirements
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((item) => ({ item }));
  const timeline = inferProposalTimeline(transcript);
  const discoveryHighlights = proposalDiscoveryHighlights(transcript);

  return markTitleDraft({
    ...data,
    title: `Proposal — ${displayName}`,
    client: { ...client, name: displayName },
    executive_summary: buildExecutiveSummary(displayName, scope),
    scope: scope.length > 0 ? scope : data.scope,
    timeline,
    discovery_notes: discoveryHighlights || data.discovery_notes,
    diagram: diagramFromTimeline(timeline),
  });
}

function pricingFromCommand(commandText: string): PricingRow[] {
  const stripped = commandText
    .replace(/\b(?:proposal|sow|quote)\s+for\s+[A-Za-z][\w-]*/i, "")
    .trim();
  return parsePricingLines(stripped);
}

export function proposalContextLabel(gathered: ProposalGatherMeta): string {
  if (gathered.method === "rts") return `RTS search used: ${gathered.label}`;
  const reason = gathered.fallbackReason ? ` — ${gathered.fallbackReason}` : "";
  const attempted = gathered.rtsAttempted ? " after RTS" : "";
  return `History fallback used${attempted}: ${gathered.label}${reason}`;
}

export async function postProposalConfirm(
  ctx: Pick<ForgeMessageContext, "say" | "threadTs" | "client" | "logger" | "replyChannelId">,
  pendingId: string,
  input: {
    source: Exclude<Awaited<ReturnType<typeof resolveProposalSource>>, { kind: "unresolved" }>;
    quality: ReturnType<typeof assessProposalTranscript>;
    pricingRows: PricingRow[];
    draftData: Record<string, unknown>;
    filename: string;
    contextLabel?: string;
    evidenceSnippets?: ReturnType<typeof proposalEvidenceSnippets>;
  },
): Promise<void> {
  const client = (input.draftData.client as { name?: string })?.name ?? input.source.clientName;
  await ctx.say({
    text: `Proposal for ${client} — review and generate when ready.`,
    thread_ts: ctx.threadTs,
    blocks: buildProposalConfirmBlocks({
      pendingId,
      source: input.source,
      quality: input.quality,
      pricingRows: input.pricingRows,
      draftData: input.draftData,
      filename: input.filename,
      contextLabel: input.contextLabel,
      evidenceSnippets: input.evidenceSnippets,
    }),
  });

  await postConfirmPreview(ctx, {
    templateId: "sales_proposal",
    draftData: input.draftData,
    filename: input.filename,
    replyChannelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
  });
}

export async function runProposalWorkflow(
  ctx: ForgeMessageContext,
  commandText: string,
): Promise<void> {
  const source = await resolveProposalSource(ctx.client, commandText);
  if (source.kind === "unresolved") {
    await ctx.say({ text: source.message, thread_ts: ctx.threadTs });
    return;
  }

  await setWorkflowTitle({
    client: ctx.client,
    channelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
    title: `Proposal — ${source.clientName}`,
    logger: ctx.logger,
  });

  await setWorkflowStatus(ctx, "Gathering discovery context…", [
    ctx.actionToken
      ? "Searching Slack with Real-Time Search…"
      : "No RTS action token; using channel history…",
    `Reading ${source.label}…`,
  ]);

  let gathered;
  try {
    gathered = await gatherProposalContext({
      client: ctx.client,
      source,
      actionToken: ctx.actionToken,
      logger: ctx.logger,
    });
  } catch (err) {
    ctx.logger.error("proposal gather failed", err);
    await ctx.say({
      text: `Could not read ${source.label}: ${formatSlackApiError(err)}`,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  const { transcript } = gathered;
  const quality = assessProposalTranscript(transcript);
  if (!quality.ok) {
    await ctx.say({
      text: `${quality.reason}\n\nSource tried: *${source.label}*.`,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  const requirements = extractRequirements(transcript);
  const inlinePricing = pricingFromCommand(commandText);
  const filename = proposalPdfFilename(source.clientName);
  const contextLabel = proposalContextLabel(gathered);
  const evidenceSnippets = proposalEvidenceSnippets(gathered.lines);

  if (inlinePricing.length === 0) {
    const pending = createPendingProposal({
      phase: "awaiting_pricing",
      clientName: source.clientName,
      source,
      transcript,
      requirements,
      contextLabel,
      evidenceSnippets,
      filename,
      replyChannelId: ctx.replyChannelId,
      threadTs: ctx.threadTs,
    });

    await ctx.say({
      text: "Add pricing in this thread to continue.",
      thread_ts: ctx.threadTs,
      blocks: buildPricingPromptBlocks(pending.id),
    });
    return;
  }

  const draftData = buildProposalDraft(source.clientName, transcript, requirements, inlinePricing);
  const pending = createPendingProposal({
    phase: "awaiting_confirm",
    clientName: source.clientName,
    source,
    transcript,
    requirements,
    contextLabel,
    evidenceSnippets,
    pricingRows: inlinePricing,
    draftData,
    filename,
    replyChannelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
  });

  await postProposalConfirm(ctx, pending.id, {
    source,
    quality,
    pricingRows: inlinePricing,
    draftData,
    filename,
    contextLabel,
    evidenceSnippets,
  });
}

export async function continueProposalWithPricing(
  ctx: ForgeMessageContext,
  pendingId: string,
  pricingText: string,
): Promise<void> {
  const rows = parsePricingLines(pricingText);
  if (rows.length === 0) {
    await ctx.say({
      text: "I couldn't parse any pricing lines. Use `Item — $amount` per line.",
      thread_ts: ctx.threadTs,
    });
    return;
  }

  const pending = updatePendingProposal(pendingId, (entry) => {
    const draftData = buildProposalDraft(
      entry.clientName,
      entry.transcript,
      entry.requirements,
      rows,
    );
    return {
      ...entry,
      phase: "awaiting_confirm",
      pricingRows: rows,
      draftData,
    };
  });

  if (!pending) {
    await ctx.say({
      text: "That request expired. Run the proposal command again.",
      thread_ts: ctx.threadTs,
    });
    return;
  }

  const quality = assessProposalTranscript(pending.transcript);
  await postProposalConfirm(ctx, pending.id, {
    source: pending.source,
    quality,
    pricingRows: rows,
    draftData: pending.draftData!,
    filename: pending.filename,
    contextLabel: pending.contextLabel,
    evidenceSnippets: pending.evidenceSnippets,
  });
}
