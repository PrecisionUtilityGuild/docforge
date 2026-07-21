import { routeDocument } from "../../forge/document-router.js";
import { normalizeWorkflowSource } from "../../forge/source-text.js";
import { getTemplate } from "../../templates/registry.js";
import { setWorkflowStatus, setWorkflowTitle } from "../agent/status.js";
import { buildDraftConfirmBlocks } from "../confirm/freehand.js";
import { postConfirmPreview } from "../confirm/preview.js";
import { extractBoardNotes, extractFencedCsv, parseBoardPeriodHint } from "../gather/board.js";
import { createPendingDraft } from "../session.js";
import type { ForgeMessageContext } from "../types.js";

/** Parse `@forge document monthly_metrics` + pasted content. */
export function parseDocumentTemplateId(text: string): string | undefined {
  const match = text.match(/\bdocument\s+([a-z][a-z0-9_-]*)\b/i);
  return match?.[1]?.toLowerCase();
}

export async function runDocumentWorkflow(
  ctx: ForgeMessageContext,
  commandText: string,
): Promise<void> {
  const templateId = parseDocumentTemplateId(commandText);
  if (!templateId) {
    await ctx.say({
      text:
        "Specify a template: `@forge document monthly_metrics` then paste CSV or notes.\n" +
        "Run `@forge templates` to see the full catalog.",
      thread_ts: ctx.threadTs,
    });
    return;
  }

  try {
    await getTemplate(templateId);
  } catch {
    await ctx.say({
      text: `Unknown template \`${templateId}\`. Run \`@forge templates\` for the catalog.`,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  const sourceText = normalizeWorkflowSource(
    commandText.replace(/\bdocument\s+[a-z][a-z0-9_-]*\b/i, "").trim(),
    { explicitTemplateId: templateId },
  );

  if (sourceText.replace(/\s+/g, "").length < 8) {
    await ctx.say({
      text: `Paste content after \`@forge document ${templateId}\` — CSV, notes, or thread context.`,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  await setWorkflowStatus(ctx, `Routing to ${templateId}…`, ["Detecting CSV/metrics…"]);

  const routed = await routeDocument({
    sourceText,
    commandText,
    explicitTemplateId: templateId,
    csv:
      templateId === "monthly_metrics" || templateId === "kpi_report"
        ? extractFencedCsv(sourceText)
        : undefined,
    period: parseBoardPeriodHint(sourceText),
    commentary:
      templateId === "monthly_metrics" || templateId === "kpi_report"
        ? extractBoardNotes(sourceText)
        : undefined,
  });

  await setWorkflowTitle({
    client: ctx.client,
    channelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
    title: `${routed.templateLabel} — ${templateId}`,
    logger: ctx.logger,
  });

  const pending = createPendingDraft({
    templateId: routed.templateId,
    templateLabel: routed.templateLabel,
    draftData: routed.draftData,
    filename: routed.filename,
    replyChannelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
  });

  await ctx.say({
    text: `${routed.templateLabel} — review and generate when ready.`,
    thread_ts: ctx.threadTs,
    blocks: buildDraftConfirmBlocks({
      pendingId: pending.id,
      inference: routed,
      allowRetemplate: routed.routedBy !== "csv",
    }),
  });

  await postConfirmPreview(ctx, {
    templateId: routed.templateId,
    draftData: routed.draftData,
    filename: routed.filename,
    replyChannelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
  });
}
