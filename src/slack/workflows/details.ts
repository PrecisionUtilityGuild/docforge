import { formatPipelineStatusText } from "../confirm/pipeline.js";
import { getFinalizableForThread } from "../session.js";
import type { ForgeMessageContext } from "../types.js";

/** `@forge details` — on-demand receipt summary without spamming the thread. */
export async function runDetailsWorkflow(ctx: ForgeMessageContext): Promise<void> {
  const doc = getFinalizableForThread(ctx.replyChannelId, ctx.threadTs);
  if (doc?.buildReceipt) {
    await ctx.say({
      text: formatPipelineStatusText(doc.buildReceipt),
      thread_ts: ctx.threadTs,
    });
    return;
  }

  await ctx.say({
    text: "No delivered PDF in this thread yet. Generate a document first, then run `@forge details` for the build receipt.",
    thread_ts: ctx.threadTs,
  });
}
