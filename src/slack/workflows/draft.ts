import { setWorkflowStatus } from "../agent/status.js";
import { fetchThreadTranscript } from "../gather/history.js";
import { routeDocument } from "../../forge/document-router.js";
import { normalizeWorkflowSource } from "../../forge/source-text.js";
import { deliverRoutedDraft } from "../forms/deliver.js";
import { buildOpenDraftFormBlocks } from "../forms/prompts.js";
import type { FormReplyTarget } from "../forms/types.js";
import type { ForgeMessageContext } from "../types.js";
import { stripDraftCommand } from "../../workflow-mappers/draft.js";

function usableDraftText(text: string): boolean {
  return text.replace(/\s+/g, " ").trim().length >= 24;
}

function isForgeCommandLine(text: string): boolean {
  return (
    /\b@forge\b/i.test(text) ||
    /^\s*<@[A-Z0-9]+>\s*(?:draft|turn this into a pdf|make a pdf|make pdf|pdf|page|one[- ]pager|document)\b/i.test(
      text,
    )
  );
}

async function sourceTextForDraft(ctx: ForgeMessageContext, commandText: string): Promise<string> {
  const inline = normalizeWorkflowSource(stripDraftCommand(commandText));
  if (usableDraftText(inline)) return inline;

  if (ctx.inThread && ctx.threadParentTs) {
    const gathered = await fetchThreadTranscript(
      ctx.client,
      ctx.replyChannelId,
      ctx.threadParentTs,
    );
    const transcript = gathered.lines
      .filter((line) => !isForgeCommandLine(line.text))
      .map((line) => line.text)
      .join("\n")
      .trim();
    if (usableDraftText(transcript)) return transcript;
  }

  return inline;
}

export async function runDraftWorkflow(
  ctx: ForgeMessageContext,
  commandText: string,
): Promise<void> {
  await setWorkflowStatus(ctx, "Reading draft source…", [
    "Looking for pasted notes or thread context…",
    "Choosing a DocForge template…",
  ]);

  let sourceText: string;
  try {
    sourceText = await sourceTextForDraft(ctx, commandText);
  } catch (err) {
    ctx.logger.error("draft source gather failed", err);
    await ctx.say({
      text: `I couldn't read the draft source: ${err instanceof Error ? err.message : String(err)}`,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  if (!usableDraftText(sourceText)) {
    const target: FormReplyTarget = {
      userId: "",
      channelId: ctx.replyChannelId,
      threadTs: ctx.threadTs,
    };
    await ctx.say({
      text: "Paste notes after `@forge draft`, or open the form.",
      thread_ts: ctx.threadTs,
      blocks: buildOpenDraftFormBlocks(target),
    });
    return;
  }

  const routed = await routeDocument({ sourceText, commandText });
  await deliverRoutedDraft(ctx, { routed, sourceText, commandText });
}
