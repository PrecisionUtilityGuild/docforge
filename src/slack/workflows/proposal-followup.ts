import { proposalPdfFilename } from "../gather/channels.js";
import { parsePricingLines } from "../gather/pricing.js";
import {
  assessProposalTranscript,
  extractRequirements,
  proposalEvidenceSnippets,
  resolveProposalSource,
} from "../gather/proposal-context.js";
import { gatherProposalContext } from "../gather/rts.js";
import { stripBotMention } from "../router.js";
import {
  createPendingProposal,
  findAwaitingPricingInChannel,
  getPendingProposalByThread,
} from "../session.js";
import type { ForgeMessageContext } from "../types.js";
import {
  buildProposalDraft,
  continueProposalWithPricing,
  postProposalConfirm,
  proposalContextLabel,
} from "./proposal.js";

/** Thread anchor Forge uses when the workflow was started (the @forge mention ts). */
export function proposalThreadAnchor(ctx: ForgeMessageContext): string {
  if (ctx.inThread && ctx.threadParentTs) return ctx.threadParentTs;
  return ctx.threadTs;
}

function findPendingAwaitingPricing(ctx: ForgeMessageContext) {
  const keys = new Set(
    [proposalThreadAnchor(ctx), ctx.threadTs, ctx.threadParentTs].filter(Boolean) as string[],
  );
  for (const ts of keys) {
    const hit = getPendingProposalByThread(ctx.replyChannelId, ts);
    if (hit?.phase === "awaiting_pricing") return hit;
  }
  return findAwaitingPricingInChannel(ctx.replyChannelId);
}

type SlackMessageLike = {
  text?: string;
  blocks?: Array<{ text?: { text?: string }; elements?: Array<{ text?: { text?: string } }> }>;
};

function pricingPromptText(message: SlackMessageLike): string {
  const parts = [message.text ?? ""];
  for (const block of message.blocks ?? []) {
    if (block.text?.text) parts.push(block.text.text);
    for (const element of block.elements ?? []) {
      if (element.text?.text) parts.push(element.text.text);
    }
  }
  return parts.join("\n");
}

export function isProposalPricingPromptMessage(message: SlackMessageLike): boolean {
  return /(?:add pricing to continue|pricing needed|enter pricing|paste pricing)/i.test(
    pricingPromptText(message),
  );
}

async function recoverProposalFromThread(
  ctx: ForgeMessageContext,
  pricingText: string,
): Promise<boolean> {
  const threadTs = proposalThreadAnchor(ctx);
  if (!threadTs) return false;

  let messages;
  try {
    const replies = await ctx.client.conversations.replies({
      channel: ctx.replyChannelId,
      ts: threadTs,
      limit: 50,
    });
    messages = replies.messages ?? [];
  } catch (err) {
    ctx.logger.warn("proposal recovery: could not read thread", err);
    return false;
  }

  const askedForPricing = messages.some(
    (message) => message.bot_id && isProposalPricingPromptMessage(message),
  );
  if (!askedForPricing) return false;

  const commandMsg = messages.find(
    (message) =>
      !message.bot_id &&
      message.text &&
      /\b(?:proposal|sow|quote)\s+for\s+[A-Za-z]/i.test(message.text),
  );
  if (!commandMsg?.text) return false;

  const rows = parsePricingLines(pricingText);
  if (rows.length === 0) return false;

  const commandText = stripBotMention(commandMsg.text);
  const source = await resolveProposalSource(ctx.client, commandText);
  if (source.kind === "unresolved") return false;

  let gathered;
  try {
    gathered = await gatherProposalContext({
      client: ctx.client,
      source,
      actionToken: ctx.actionToken,
      logger: ctx.logger,
    });
  } catch (err) {
    ctx.logger.warn("proposal recovery: gather failed", err);
    return false;
  }

  const quality = assessProposalTranscript(gathered.transcript);
  if (!quality.ok) return false;

  const requirements = extractRequirements(gathered.transcript);
  const contextLabel = proposalContextLabel(gathered);
  const evidenceSnippets = proposalEvidenceSnippets(gathered.lines);
  const draftData = buildProposalDraft(source.clientName, gathered.transcript, requirements, rows);
  const filename = proposalPdfFilename(source.clientName);

  const pending = createPendingProposal({
    phase: "awaiting_confirm",
    clientName: source.clientName,
    source,
    transcript: gathered.transcript,
    requirements,
    contextLabel,
    evidenceSnippets,
    pricingRows: rows,
    draftData,
    filename,
    replyChannelId: ctx.replyChannelId,
    threadTs,
  });

  await postProposalConfirm(ctx, pending.id, {
    source,
    quality,
    pricingRows: rows,
    draftData,
    filename,
    contextLabel,
    evidenceSnippets,
  });
  return true;
}

export async function tryProposalPricingFollowUp(ctx: ForgeMessageContext): Promise<boolean> {
  const pricingText = stripBotMention(ctx.text);
  const rows = parsePricingLines(pricingText);
  if (rows.length === 0) return false;

  const pending = findPendingAwaitingPricing(ctx);
  if (pending) {
    await continueProposalWithPricing(ctx, pending.id, pricingText);
    return true;
  }

  if (await recoverProposalFromThread(ctx, pricingText)) return true;

  return false;
}

export function looksLikePricingMessage(text: string): boolean {
  return parsePricingLines(text).length > 0;
}
