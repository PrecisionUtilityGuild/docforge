import type { WebClient } from "@slack/web-api";
import type { ForgeMessageContext } from "../types.js";

export async function setWorkflowStatus(
  ctx: Pick<ForgeMessageContext, "setStatus" | "logger">,
  status: string,
  loadingMessages: string[] = [],
): Promise<void> {
  if (!ctx.setStatus) return;
  try {
    await ctx.setStatus({
      status,
      ...(loadingMessages.length > 0 ? { loading_messages: loadingMessages } : {}),
    });
  } catch (err) {
    ctx.logger.debug?.("assistant status update skipped", err);
  }
}

export async function setThreadWorkflowStatus(input: {
  client: WebClient;
  channelId: string;
  threadTs: string;
  status: string;
  loadingMessages?: string[];
  logger?: { debug?: (...args: unknown[]) => void };
}): Promise<void> {
  try {
    await input.client.assistant.threads.setStatus({
      channel_id: input.channelId,
      thread_ts: input.threadTs,
      status: input.status,
      ...(input.loadingMessages?.length ? { loading_messages: input.loadingMessages } : {}),
    });
  } catch (err) {
    input.logger?.debug?.("assistant thread status update skipped", err);
  }
}

/**
 * Name the assistant thread so it's findable in the app's history tab
 * (per Slack agent best practices). No-op for non-assistant threads — a plain
 * channel @mention can't be titled, which is expected and silently ignored.
 */
export async function setWorkflowTitle(input: {
  client: WebClient;
  channelId: string;
  threadTs: string;
  title: string;
  logger?: { debug?: (...args: unknown[]) => void };
}): Promise<void> {
  try {
    await input.client.assistant.threads.setTitle({
      channel_id: input.channelId,
      thread_ts: input.threadTs,
      title: input.title.slice(0, 120),
    });
  } catch (err) {
    input.logger?.debug?.("assistant thread title skipped", err);
  }
}

export async function sayStreamProgress(
  ctx: Pick<ForgeMessageContext, "sayStream" | "logger">,
  text: string,
): Promise<void> {
  if (!ctx.sayStream) return;
  try {
    const stream = ctx.sayStream();
    await stream.append({ markdown_text: text });
    await stream.stop();
  } catch (err) {
    ctx.logger.debug?.("assistant stream update skipped", err);
  }
}
