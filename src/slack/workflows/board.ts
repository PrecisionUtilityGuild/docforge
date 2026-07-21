import { csvAndNotesToKpiReport } from "../../service.js";
import { setWorkflowStatus } from "../agent/status.js";
import { deliverBoardPack } from "../forms/deliver.js";
import { buildOpenMetricsFormBlocks } from "../forms/prompts.js";
import type { FormReplyTarget } from "../forms/types.js";
import {
  assessBoardCsv,
  extractBoardNotes,
  extractFencedCsv,
  findCsvFile,
  looksLikeCsv,
  parseBoardPeriod,
} from "../gather/board.js";
import { downloadSlackTextFile } from "../gather/files.js";
import { formatSlackApiError } from "../errors.js";
import { markTitleDraft } from "../confirm/draft.js";
import type { ForgeMessageContext } from "../types.js";

export function buildBoardDraft(
  csv: string,
  notes: string,
  period: string,
): Record<string, unknown> {
  // The mapper already grounds summary/commentary (from notes when present, or a
  // data-derived line when not). Don't clobber that with raw notes — doing so
  // re-introduced empty summary/commentary (schema requires >=1 char) whenever
  // the user gave no notes.
  const data = csvAndNotesToKpiReport(csv, notes);
  return markTitleDraft({
    ...data,
    title: `Board KPI Pack — ${period}`,
    period,
    author: "Forge",
  });
}

async function csvFromContext(ctx: ForgeMessageContext): Promise<string | undefined> {
  const inline = extractFencedCsv(ctx.text);
  if (inline) return inline;

  const csvFile = findCsvFile(ctx.files);
  if (!csvFile) return undefined;
  return downloadSlackTextFile(ctx.client, csvFile);
}

export async function runBoardWorkflow(
  ctx: ForgeMessageContext,
  commandText: string,
): Promise<void> {
  await setWorkflowStatus(ctx, "Gathering KPI inputs…", [
    "Looking for a CSV attachment…",
    "Checking board-pack fields…",
  ]);

  let csv: string | undefined;
  try {
    csv = await csvFromContext(ctx);
  } catch (err) {
    ctx.logger.error("board CSV gather failed", err);
    await ctx.say({
      text: `Could not read the attached CSV: ${formatSlackApiError(err)}`,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  if (!csv) {
    const target: FormReplyTarget = {
      userId: "",
      channelId: ctx.replyChannelId,
      threadTs: ctx.threadTs,
    };
    await ctx.say({
      text: "Board pack needs KPI metrics — attach a CSV, paste a block, or use the form.",
      thread_ts: ctx.threadTs,
      blocks: buildOpenMetricsFormBlocks(target),
    });
    return;
  }

  const quality = assessBoardCsv(csv);
  if (!quality.ok) {
    // If a file was attached but its content doesn't parse as CSV at all, the
    // likely cause is the bot couldn't read the file (missing files:read scope)
    // rather than a malformed header — say so instead of blaming the columns.
    const fileAttached = Boolean(findCsvFile(ctx.files));
    const unreadable = fileAttached && !looksLikeCsv(csv);
    await ctx.say({
      text: unreadable
        ? "I found your attached file but couldn't read its contents as CSV. " +
          "This usually means I'm missing the `files:read` scope — reinstall the app with the updated manifest, then try again."
        : (quality.reason ?? "That CSV doesn't look like KPI data yet."),
      thread_ts: ctx.threadTs,
    });
    return;
  }

  const period = parseBoardPeriod(commandText);
  const notes = extractBoardNotes(ctx.text);
  await deliverBoardPack(ctx, { csv, notes, period });
}
