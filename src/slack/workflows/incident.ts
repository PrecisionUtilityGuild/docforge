import { transcriptLinesToIncidentReport } from "../../service.js";
import {
  pickIncidentTemplate,
  transcriptLinesToPostmortem,
} from "../../workflow-mappers/postmortem.js";
import { setWorkflowStatus, setWorkflowTitle } from "../agent/status.js";
import { buildIncidentConfirmBlocks } from "../confirm/incident.js";
import { postConfirmPreview } from "../confirm/preview.js";
import { assessIncidentTranscript, resolveIncidentSource } from "../gather/context.js";
import { channelNameToIncidentId, incidentPdfFilename } from "../gather/channels.js";
import { gatherIncidentTranscript } from "../gather/history.js";
import { enrichIncidentWithRts } from "../gather/rts.js";
import { linesToTranscript } from "../gather/transcript.js";
import { markTitleDraft } from "../confirm/draft.js";
import { formatSlackApiError } from "../errors.js";
import { createPendingIncident } from "../session.js";
import type { ForgeMessageContext } from "../types.js";

export async function runIncidentWorkflow(
  ctx: ForgeMessageContext,
  commandText: string,
): Promise<void> {
  const source = await resolveIncidentSource(ctx.client, commandText, {
    replyChannelId: ctx.replyChannelId,
    isDm: ctx.isDm,
    inThread: ctx.inThread,
    threadParentTs: ctx.threadParentTs,
  });

  if (source.kind === "unresolved") {
    await ctx.say({ text: source.message, thread_ts: ctx.threadTs });
    return;
  }

  await setWorkflowTitle({
    client: ctx.client,
    channelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
    title: `Incident report — ${source.label}`,
    logger: ctx.logger,
  });

  await setWorkflowStatus(ctx, "Gathering incident source…", [
    `Reading ${source.label}…`,
    "Building chronological transcript…",
  ]);

  let gathered;
  try {
    gathered = await gatherIncidentTranscript(ctx.client, source);
  } catch (err) {
    ctx.logger.error("incident gather failed", err);
    await ctx.say({
      text: `Could not read ${source.label}: ${formatSlackApiError(err)}`,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  let { transcript, lines } = gathered;
  const quality = assessIncidentTranscript(transcript);
  if (!quality.ok) {
    await ctx.say({
      text: `${quality.reason}\n\nSource tried: *${source.label}*.`,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  // Slack-native enrichment: Real-Time Search surfaces related discussion across
  // the workspace (root-cause threads, related alerts) beyond the one channel.
  // History remains the primary timeline; RTS only adds evidence.
  const sourceChannelName = "channelName" in source ? source.channelName : undefined;
  // Natural-language phrasing triggers Slack semantic search (per RTS docs).
  const rtsQuery = sourceChannelName
    ? `What caused the ${sourceChannelName} incident and what was the impact?`
    : "What caused this production incident and what was the impact?";
  // Scope the search to the incident's own time window (±30 min) to cut noise.
  const tsNums = lines.map((l) => Number(l.ts)).filter((n) => Number.isFinite(n) && n > 0);
  const window =
    tsNums.length > 0
      ? {
          after: Math.floor(Math.min(...tsNums)) - 1800,
          before: Math.ceil(Math.max(...tsNums)) + 1800,
        }
      : {};
  const rts = await enrichIncidentWithRts({
    client: ctx.client,
    query: rtsQuery,
    actionToken: ctx.actionToken,
    existing: lines,
    ...window,
    logger: ctx.logger,
  });
  if (rts.used) {
    lines = [...lines, ...rts.relatedLines];
    transcript = linesToTranscript(lines);
  }

  await setWorkflowStatus(ctx, "Structuring incident report…", [
    "Applying schema…",
    "Checking root-cause confidence…",
  ]);

  const templateId = pickIncidentTemplate(commandText, lines.length);
  let data =
    templateId === "postmortem"
      ? transcriptLinesToPostmortem(lines)
      : transcriptLinesToIncidentReport(lines);
  const channelName = source.kind === "thread" ? undefined : source.channelName;

  if (channelName) {
    const incidentId = channelNameToIncidentId(channelName);
    if (incidentId) data.incident_id = incidentId;
  }

  // Every Forge document is machine-assembled, so it ships as DRAFT until the
  // human approves it (see finalize flow). Root-cause confidence is surfaced
  // separately as a content caveat on the confirm card, not as the title driver.
  data = markTitleDraft(data);
  const title = data.title as string;

  const filename = incidentPdfFilename(channelName);
  const pending = createPendingIncident({
    source,
    transcript,
    templateId,
    draftData: data,
    filename,
    replyChannelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
  });

  await ctx.say({
    text: "Review below — generate when ready.",
    thread_ts: ctx.threadTs,
    blocks: buildIncidentConfirmBlocks({
      pendingId: pending.id,
      source,
      quality,
      transcript,
      title,
      filename,
      draftData: data,
      templateId,
    }),
  });

  await postConfirmPreview(ctx, {
    templateId,
    draftData: data,
    filename,
    replyChannelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
  });
}
