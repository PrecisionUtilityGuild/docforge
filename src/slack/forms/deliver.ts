import { routeDocument } from "../../forge/document-router.js";
import { setWorkflowStatus, setWorkflowTitle } from "../agent/status.js";
import { buildBoardConfirmBlocks } from "../confirm/board.js";
import { buildDraftChoiceBlocks, buildDraftConfirmBlocks } from "../confirm/freehand.js";
import { postConfirmPreview } from "../confirm/preview.js";
import { assessBoardCsv, boardPdfFilename } from "../gather/board.js";
import {
  createPendingBoardPack,
  createPendingDraft,
  createPendingDraftChoice,
} from "../session.js";
import type { ForgeMessageContext } from "../types.js";
import { buildBoardDraft } from "../workflows/board.js";
import type { MetricsPackKind } from "./metrics-intake.js";

type DeliverCtx = Pick<ForgeMessageContext, "client" | "logger" | "say" | "setStatus"> & {
  replyChannelId: string;
  threadTs: string;
};

export async function deliverMetricsPack(
  ctx: DeliverCtx,
  input: {
    packKind: MetricsPackKind;
    period: string;
    csv: string;
    commentary: string;
  },
): Promise<void> {
  if (input.packKind === "kpi_report") {
    await deliverBoardPack(ctx, {
      csv: input.csv,
      notes: input.commentary,
      period: input.period,
    });
    return;
  }

  const routed = await routeDocument({
    sourceText: input.commentary || input.period,
    csv: input.csv,
    commandText: "monthly metrics",
    explicitTemplateId: "monthly_metrics",
    period: input.period,
    commentary: input.commentary,
  });
  await deliverRoutedDraft(ctx, {
    routed,
    sourceText: input.commentary || input.period,
    commandText: "monthly metrics",
  });
}

export async function deliverRoutedDraft(
  ctx: DeliverCtx,
  input: {
    routed: Awaited<ReturnType<typeof routeDocument>>;
    sourceText: string;
    commandText?: string;
  },
): Promise<void> {
  const { routed, sourceText } = input;

  if (routed.ambiguous && routed.candidates.length >= 2) {
    const choice = createPendingDraftChoice({
      sourceText,
      replyChannelId: ctx.replyChannelId,
      threadTs: ctx.threadTs,
    });
    await ctx.say({
      text: "Pick a document shape — same notes, different template.",
      thread_ts: ctx.threadTs,
      blocks: buildDraftChoiceBlocks({ choiceId: choice.id, inference: routed }),
    });
    return;
  }

  await setWorkflowTitle({
    client: ctx.client,
    channelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
    title: `${routed.templateLabel} — draft`,
    logger: ctx.logger,
  });
  await setWorkflowStatus({ setStatus: ctx.setStatus, logger: ctx.logger }, "Preparing draft…", [
    `Template: ${routed.templateLabel}`,
  ]);

  const pending = createPendingDraft({
    templateId: routed.templateId,
    templateLabel: routed.templateLabel,
    draftData: routed.draftData,
    filename: routed.filename,
    sourceText,
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

  await postConfirmPreview(
    { client: ctx.client, logger: ctx.logger },
    {
      templateId: routed.templateId,
      draftData: routed.draftData,
      filename: routed.filename,
      replyChannelId: ctx.replyChannelId,
      threadTs: ctx.threadTs,
    },
  );
}

export async function deliverBoardPack(
  ctx: DeliverCtx,
  input: { csv: string; notes: string; period: string },
): Promise<void> {
  const quality = assessBoardCsv(input.csv);
  if (!quality.ok) {
    await ctx.say({
      text: quality.reason ?? "That CSV doesn't look like KPI data yet.",
      thread_ts: ctx.threadTs,
    });
    return;
  }

  await setWorkflowTitle({
    client: ctx.client,
    channelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
    title: `Board KPI pack — ${input.period}`,
    logger: ctx.logger,
  });
  await setWorkflowStatus(
    { setStatus: ctx.setStatus, logger: ctx.logger },
    "Structuring board pack…",
    ["Applying kpi_report schema…"],
  );

  const draftData = buildBoardDraft(input.csv, input.notes, input.period);
  const filename = boardPdfFilename(input.period);
  const pending = createPendingBoardPack({
    period: input.period,
    csv: input.csv,
    notes: input.notes,
    draftData,
    filename,
    replyChannelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
  });

  await ctx.say({
    text: `Board pack for ${input.period} — review and generate when ready.`,
    thread_ts: ctx.threadTs,
    blocks: buildBoardConfirmBlocks({
      pendingId: pending.id,
      period: input.period,
      quality,
      draftData,
      filename,
    }),
  });

  await postConfirmPreview(
    { client: ctx.client, logger: ctx.logger },
    {
      templateId: "kpi_report",
      draftData,
      filename,
      replyChannelId: ctx.replyChannelId,
      threadTs: ctx.threadTs,
    },
  );
}
