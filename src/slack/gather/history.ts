import type { WebClient } from "@slack/web-api";
import type { IncidentSource } from "./context.js";
import { linesToTranscript, type TranscriptLine } from "./transcript.js";

export type GatheredTranscript = {
  lines: TranscriptLine[];
  transcript: string;
};

type SlackHistoryMessage = {
  ts?: string;
  text?: string;
  user?: string;
  bot_id?: string;
  bot_profile?: unknown;
  subtype?: string;
  reply_count?: number;
};

const SKIP_SUBTYPES = new Set([
  "channel_join",
  "channel_leave",
  "group_join",
  "group_leave",
  "bot_add",
  "bot_remove",
]);

function compareTs(a: string, b: string): number {
  return Number(a) - Number(b);
}

function shouldSkipMessage(message: SlackHistoryMessage): boolean {
  if (!message.text?.trim()) return true;
  if (message.subtype && SKIP_SUBTYPES.has(message.subtype)) return true;
  if (message.bot_id || message.bot_profile || message.subtype === "bot_message") {
    return isForgeOperationalMessage(message.text);
  }
  return false;
}

function isForgeOperationalMessage(text: string): boolean {
  return /^(?:Forge live QA:|Forge QA run:|Review below\b|Approve or request changes below\.|Add pricing in this thread\b|Status for .+ — review and generate\b|Proposal for .+ — review and generate\b|Incident report .+ — review\b|PDF compiled but upload failed:|Could not compile\b|Document ready\.)/i.test(
    text.trim(),
  );
}

async function speakerLabel(
  client: WebClient,
  cache: Map<string, string>,
  userId?: string,
): Promise<string> {
  if (!userId) return "team";
  const cached = cache.get(userId);
  if (cached) return cached;

  try {
    const info = await client.users.info({ user: userId });
    const label =
      info.user?.profile?.display_name || info.user?.real_name || info.user?.name || userId;
    cache.set(userId, label);
    return label;
  } catch {
    return userId;
  }
}

function toLine(message: SlackHistoryMessage, speaker: string): TranscriptLine {
  return {
    ts: message.ts ?? "0",
    text: message.text ?? "",
    speaker,
  };
}

async function messagesToGathered(
  client: WebClient,
  messages: SlackHistoryMessage[],
): Promise<GatheredTranscript> {
  const userCache = new Map<string, string>();
  const lines: TranscriptLine[] = [];
  for (const message of messages) {
    if (shouldSkipMessage(message)) continue;
    const speaker = await speakerLabel(client, userCache, message.user);
    lines.push(toLine(message, speaker));
  }
  return { lines, transcript: linesToTranscript(lines) };
}

export async function fetchThreadTranscript(
  client: WebClient,
  channelId: string,
  threadTs: string,
): Promise<GatheredTranscript> {
  const thread = await client.conversations.replies({
    channel: channelId,
    ts: threadTs,
    limit: 100,
  });
  const messages = [...(thread.messages ?? [])].sort((a, b) => compareTs(a.ts ?? "0", b.ts ?? "0"));
  return messagesToGathered(client, messages);
}

export async function fetchChannelTranscript(
  client: WebClient,
  channelId: string,
  limit = 50,
): Promise<GatheredTranscript> {
  const history = await client.conversations.history({
    channel: channelId,
    limit,
  });

  const topLevel = [...(history.messages ?? [])].sort((a, b) =>
    compareTs(a.ts ?? "0", b.ts ?? "0"),
  );

  const userCache = new Map<string, string>();
  const lines: TranscriptLine[] = [];

  for (const message of topLevel) {
    if (shouldSkipMessage(message)) continue;

    const speaker = await speakerLabel(client, userCache, message.user);
    lines.push(toLine(message, speaker));

    if ((message.reply_count ?? 0) > 0 && message.ts) {
      const thread = await client.conversations.replies({
        channel: channelId,
        ts: message.ts,
        limit: 100,
      });
      const replies = [...(thread.messages ?? [])]
        .filter((reply) => reply.ts !== message.ts)
        .sort((a, b) => compareTs(a.ts ?? "0", b.ts ?? "0"));

      for (const reply of replies) {
        if (shouldSkipMessage(reply)) continue;
        const replySpeaker = await speakerLabel(client, userCache, reply.user);
        lines.push(toLine(reply, replySpeaker));
      }
    }
  }

  return { lines, transcript: linesToTranscript(lines) };
}

export async function gatherIncidentTranscript(
  client: WebClient,
  source: Exclude<IncidentSource, { kind: "unresolved" }>,
): Promise<GatheredTranscript> {
  switch (source.kind) {
    case "thread":
      return fetchThreadTranscript(client, source.channelId, source.threadTs);
    case "explicit_channel":
    case "channel_recent":
      return fetchChannelTranscript(client, source.channelId);
  }
}
