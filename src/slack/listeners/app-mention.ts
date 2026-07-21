import type { AllMiddlewareArgs, SayStreamFn, SlackEventMiddlewareArgs } from "@slack/bolt";
import { handleForgeMessage } from "../handler.js";

type AppMentionArgs = AllMiddlewareArgs &
  SlackEventMiddlewareArgs<"app_mention"> & {
    sayStream?: SayStreamFn;
  };

function actionToken(event: unknown): string | undefined {
  const direct = (event as { action_token?: string }).action_token;
  if (direct) return direct;
  return (event as { assistant_thread?: { action_token?: string } }).assistant_thread?.action_token;
}

export async function handleAppMention({
  client,
  event,
  logger,
  say,
  sayStream,
  setStatus,
}: AppMentionArgs): Promise<void> {
  const inThread = Boolean(event.thread_ts);
  await handleForgeMessage({
    text: event.text ?? "",
    threadTs: event.thread_ts ?? event.ts,
    replyChannelId: event.channel,
    isDm: false,
    inThread,
    threadParentTs: event.thread_ts,
    files: "files" in event ? event.files : undefined,
    actionToken: actionToken(event),
    say,
    sayStream,
    setStatus,
    client,
    logger,
  });
}
