import type { AllMiddlewareArgs, SayStreamFn, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { GenericMessageEvent } from "@slack/types";
import { handleForgeMessage } from "../handler.js";
import { tryProposalPricingFollowUp } from "../workflows/proposal-followup.js";
import type { ForgeMessageContext } from "../types.js";

type MessageArgs = AllMiddlewareArgs &
  SlackEventMiddlewareArgs<"message"> & {
    sayStream?: SayStreamFn;
  };

function isUserDm(event: GenericMessageEvent): boolean {
  return event.channel_type === "im";
}

function isUserTextOrFileMessage(
  event: SlackEventMiddlewareArgs<"message">["event"],
): event is GenericMessageEvent & { subtype?: "file_share"; files?: ForgeMessageContext["files"] } {
  if (!("subtype" in event) || event.subtype === undefined) return true;
  return event.subtype === "file_share";
}

export async function handleMessage({
  client,
  event,
  logger,
  say,
  sayStream,
  setStatus,
}: MessageArgs): Promise<void> {
  if (!isUserTextOrFileMessage(event)) return;
  if (event.bot_id || event.bot_profile) return;

  logger.info(
    `message ch=${event.channel} type=${event.channel_type ?? "?"} thread=${event.thread_ts ?? "—"} chars=${event.text?.length ?? 0}`,
  );

  const threadCtx: ForgeMessageContext = {
    text: event.text ?? "",
    threadTs: event.thread_ts ?? event.ts,
    replyChannelId: event.channel,
    isDm: isUserDm(event),
    inThread: Boolean(event.thread_ts),
    threadParentTs: event.thread_ts,
    files: event.files,
    actionToken: (event as { assistant_thread?: { action_token?: string } }).assistant_thread
      ?.action_token,
    say,
    sayStream,
    setStatus,
    client,
    logger,
  };

  if (await tryProposalPricingFollowUp(threadCtx)) return;

  if (!isUserDm(event)) return;

  await handleForgeMessage(threadCtx);
}
