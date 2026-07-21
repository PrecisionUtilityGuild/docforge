import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { formatWelcomeMessage } from "../agent/prompts.js";
import {
  suggestedPromptsForChannel,
  type ChannelSignal,
  type SuggestedPrompt,
} from "../agent/suggestions.js";

type AssistantThreadStartedArgs = AllMiddlewareArgs &
  SlackEventMiddlewareArgs<"assistant_thread_started">;

/** Static fallback (DM / unknown channel) — kept exported for tests & callers. */
export const SUGGESTED_PROMPTS: SuggestedPrompt[] = suggestedPromptsForChannel({});

/**
 * The Assistant pane carries the channel the user opened it from in
 * `assistant_thread.context`. We read that channel's name/topic (Slack-native,
 * no LLM) so the first suggested prompt is the workflow that channel is for —
 * e.g. opening Forge inside #incident-api-gateway leads with "Incident report for INC-042".
 */
async function channelSignal(
  client: WebClient,
  contextChannelId: string | undefined,
  paneChannelId: string,
  logger: { debug?: (...a: unknown[]) => void },
): Promise<ChannelSignal> {
  const sourceChannel = contextChannelId;
  // No surrounding channel (opened from the app DM / home) → nothing to specialize.
  if (!sourceChannel || sourceChannel === paneChannelId) return { isDm: true };
  try {
    const info = await client.conversations.info({ channel: sourceChannel });
    return {
      name: info.channel?.name,
      topic: [info.channel?.topic?.value, info.channel?.purpose?.value].filter(Boolean).join(" "),
    };
  } catch (err) {
    logger.debug?.("could not read source channel for suggestions", err);
    return {};
  }
}

export async function handleAssistantThreadStarted({
  client,
  event,
  logger,
}: AssistantThreadStartedArgs): Promise<void> {
  const { channel_id: channelId, thread_ts: threadTs, context } = event.assistant_thread;
  const contextChannelId = (context as { channel_id?: string } | undefined)?.channel_id;

  try {
    const signal = await channelSignal(client, contextChannelId, channelId, logger);

    // Greet first so the pane isn't silent, then offer the channel-aware chips.
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: formatWelcomeMessage(signal.name),
    });

    const prompts = suggestedPromptsForChannel(signal);
    await client.assistant.threads.setSuggestedPrompts({
      channel_id: channelId,
      thread_ts: threadTs,
      title: signal.name ? `Forge · #${signal.name}` : "Start a Forge workflow",
      prompts,
    });
  } catch (err) {
    logger.error("assistant_thread_started failed", err);
  }
}
