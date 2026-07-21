import { transcriptLinesToProjectStatus } from "../../service.js";
import { setWorkflowStatus, setWorkflowTitle } from "../agent/status.js";
import { markTitleDraft } from "../confirm/draft.js";
import { buildStatusConfirmBlocks } from "../confirm/status.js";
import { postConfirmPreview } from "../confirm/preview.js";
import { resolveIncidentSource } from "../gather/context.js";
import { gatherIncidentTranscript } from "../gather/history.js";
import { enrichIncidentWithRts } from "../gather/rts.js";
import { formatSlackApiError } from "../errors.js";
import { createPendingStatus } from "../session.js";
import type { ForgeMessageContext } from "../types.js";

const PERIOD = /\b(?:for|this|last)\s+((?:q[1-4]|h[12]|week|month|sprint|quarter)[\w\s,'-]*)/i;

function statusPeriod(commandText: string): string {
  const m = commandText.match(PERIOD);
  if (m?.[1]) return m[1].replace(/\s+/g, " ").trim().slice(0, 60);
  return `Week of ${new Date().toISOString().slice(0, 10)}`;
}

function statusFilename(channelLabel: string): string {
  const slug = channelLabel
    .replace(/^#/, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `Status-${slug || "Update"}.pdf`;
}

export async function runStatusWorkflow(
  ctx: ForgeMessageContext,
  commandText: string,
): Promise<void> {
  // Reuse the incident channel-resolution: "status for #team-eng" / a thread / the
  // current channel all resolve the same way (a channel to read recent activity from).
  const source = await resolveIncidentSource(ctx.client, commandText, {
    replyChannelId: ctx.replyChannelId,
    isDm: ctx.isDm,
    inThread: ctx.inThread,
    threadParentTs: ctx.threadParentTs,
  });

  if (source.kind === "unresolved") {
    await ctx.say({
      text: "Which channel should I summarize? Try `@forge status for #team-eng`.",
      thread_ts: ctx.threadTs,
    });
    return;
  }

  const channelLabel = "channelName" in source ? `#${source.channelName}` : source.label;

  await setWorkflowTitle({
    client: ctx.client,
    channelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
    title: `Status report — ${channelLabel}`,
    logger: ctx.logger,
  });
  await setWorkflowStatus(ctx, "Reading channel activity…", [
    `Reading ${channelLabel}…`,
    "Grouping into workstreams and RAG…",
  ]);

  let gathered;
  try {
    gathered = await gatherIncidentTranscript(ctx.client, source);
  } catch (err) {
    ctx.logger.error("status gather failed", err);
    await ctx.say({
      text: `Could not read ${channelLabel}: ${formatSlackApiError(err)}`,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  let lines = gathered.lines;
  if (lines.length === 0) {
    await ctx.say({
      text: `No recent activity I can read in ${channelLabel}. Invite me to the channel, or pick one with discussion.`,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  // RTS adds related cross-channel progress (e.g. a project's threads in other
  // channels). History stays primary; RTS only supplements, and never throws.
  const channelName = "channelName" in source ? source.channelName : undefined;
  const rts = await enrichIncidentWithRts({
    client: ctx.client,
    query: channelName
      ? `What is the latest progress, blockers, and next steps for ${channelName}?`
      : "What is the latest project progress, blockers, and next steps?",
    actionToken: ctx.actionToken,
    existing: lines,
    logger: ctx.logger,
  });
  if (rts.used) {
    lines = [...lines, ...rts.relatedLines];
  }

  const period = statusPeriod(commandText);
  await setWorkflowStatus(ctx, "Structuring status report…", [
    "Grouping into workstreams and RAG…",
  ]);

  let data = transcriptLinesToProjectStatus(lines, { period, channelLabel });
  data = markTitleDraft(data);
  const filename = statusFilename(channelLabel);

  const pending = createPendingStatus({
    channelLabel,
    draftData: data,
    filename,
    replyChannelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
  });

  await ctx.say({
    text: `Status for ${channelLabel} — review and generate when ready.`,
    thread_ts: ctx.threadTs,
    blocks: buildStatusConfirmBlocks({
      pendingId: pending.id,
      channelLabel,
      lineCount: lines.length,
      draftData: data,
      filename,
    }),
  });

  await postConfirmPreview(ctx, {
    templateId: "project_status",
    draftData: data,
    filename,
    replyChannelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
  });
}
