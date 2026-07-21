import type { WebClient } from "@slack/web-api";

/** Where to post the confirm card after a gather modal submits. */
export type FormReplyTarget = {
  channelId: string;
  threadTs: string;
  userId: string;
};

export function encodeFormTarget(target: FormReplyTarget): string {
  return JSON.stringify(target);
}

export function decodeFormTarget(raw: string): FormReplyTarget | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<FormReplyTarget>;
    if (
      typeof parsed.userId === "string" &&
      typeof parsed.channelId === "string" &&
      typeof parsed.threadTs === "string"
    ) {
      return {
        userId: parsed.userId,
        channelId: parsed.channelId,
        threadTs: parsed.threadTs,
      };
    }
  } catch {
    // invalid metadata
  }
  return undefined;
}

/** Ensure we have a thread anchor — DM for App Home, or a new root message in-channel. */
export async function ensureFormReplyTarget(
  client: WebClient,
  target: FormReplyTarget,
): Promise<FormReplyTarget> {
  if (target.channelId && target.threadTs) return target;

  if (!target.channelId && target.userId) {
    const opened = await client.conversations.open({ users: target.userId });
    const channelId = opened.channel?.id;
    if (!channelId) throw new Error("Could not open a DM with you.");
    const posted = await client.chat.postMessage({
      channel: channelId,
      text: "Forge — review your document below.",
    });
    const threadTs = posted.ts;
    if (!threadTs) throw new Error("Could not start a Forge thread.");
    return { userId: target.userId, channelId, threadTs };
  }

  if (target.channelId && !target.threadTs) {
    const posted = await client.chat.postMessage({
      channel: target.channelId,
      text: "Forge — review your document below.",
    });
    const threadTs = posted.ts;
    if (!threadTs) throw new Error("Could not start a Forge thread.");
    return { ...target, threadTs };
  }

  throw new Error("Missing channel context for this form.");
}
