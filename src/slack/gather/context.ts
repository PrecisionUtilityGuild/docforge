import type { WebClient } from "@slack/web-api";
import { findChannelIdByName, parseChannelRef, type ResolvedChannel } from "./channels.js";

export type IncidentSource =
  | {
      kind: "explicit_channel";
      channelId: string;
      channelName?: string;
      label: string;
    }
  | {
      kind: "thread";
      channelId: string;
      threadTs: string;
      label: string;
    }
  | {
      kind: "channel_recent";
      channelId: string;
      channelName?: string;
      label: string;
    }
  | { kind: "unresolved"; message: string };

export type TranscriptQuality = {
  ok: boolean;
  reason?: string;
  signals: string[];
  lineCount: number;
};

export type ForgeLocation = {
  replyChannelId: string;
  isDm: boolean;
  inThread: boolean;
  threadParentTs?: string;
};

export async function resolveIncidentSource(
  client: WebClient,
  commandText: string,
  location: ForgeLocation,
): Promise<IncidentSource> {
  const ref = parseChannelRef(commandText);
  const normalized = commandText.toLowerCase();
  const wantsThread = /\b(this thread|in this thread|here)\b/.test(normalized);
  const wantsChannel = /\b(this channel|in this channel)\b/.test(normalized);

  if (ref.channelId || ref.channelName) {
    const target = await resolveChannelRef(client, ref, location.replyChannelId, location.isDm);
    if (!target) {
      return {
        kind: "unresolved",
        message:
          `I couldn't find ${ref.channelName ? `#${ref.channelName}` : "that channel"}. ` +
          "Invite @Forge there, or run the command inside the incident thread.",
      };
    }
    return {
      kind: "explicit_channel",
      channelId: target.id,
      channelName: target.name,
      label: target.name ? `#${target.name}` : `<#${target.id}>`,
    };
  }

  if (wantsThread || (location.inThread && location.threadParentTs && !wantsChannel)) {
    return {
      kind: "thread",
      channelId: location.replyChannelId,
      threadTs: location.threadParentTs!,
      label: "this thread",
    };
  }

  if (!location.isDm && (wantsChannel || !location.inThread)) {
    const name = await channelName(client, location.replyChannelId);
    return {
      kind: "channel_recent",
      channelId: location.replyChannelId,
      channelName: name,
      label: name ? `recent messages in #${name}` : "recent messages in this channel",
    };
  }

  if (location.inThread && location.threadParentTs) {
    return {
      kind: "thread",
      channelId: location.replyChannelId,
      threadTs: location.threadParentTs,
      label: "this thread",
    };
  }

  return {
    kind: "unresolved",
    message:
      "Slack context is messy — tell me where to look:\n" +
      "• `@forge incident report from #incident-api-gateway` — a dedicated incident channel\n" +
      "• Run inside the *incident thread* — I'll use that thread only\n" +
      "• `@forge incident report in this channel` — last ~50 messages here (noisy if mixed traffic)",
  };
}

export function assessIncidentTranscript(transcript: string): TranscriptQuality {
  const lineCount = transcript.split(/\r?\n/).filter(Boolean).length;
  const signals: string[] = [];

  if (lineCount >= 3) signals.push(`${lineCount} timeline lines`);
  if (
    /\b(error rate|outage|degrad|pager|incident|sev[- ]?[01]|rollback|all clear)\b/i.test(
      transcript,
    )
  ) {
    signals.push("incident language");
  }
  if (/\broot cause\b/i.test(transcript)) signals.push("root-cause discussion");

  if (lineCount < 2) {
    return {
      ok: false,
      reason: `Only ${lineCount} usable line(s) — I need more than a one-liner to write a report.`,
      signals,
      lineCount,
    };
  }

  if (signals.length === 0) {
    return {
      ok: false,
      reason:
        "This doesn't read like incident traffic yet (no errors, outage, rollback, etc.). " +
        "Point me at the right channel or thread.",
      signals,
      lineCount,
    };
  }

  return { ok: true, signals, lineCount };
}

async function resolveChannelRef(
  client: WebClient,
  ref: ReturnType<typeof parseChannelRef>,
  _fallbackChannelId: string,
  _isDm: boolean,
): Promise<ResolvedChannel | null> {
  if (ref.channelId) {
    try {
      const info = await client.conversations.info({ channel: ref.channelId });
      return { id: ref.channelId, name: info.channel?.name ?? ref.channelName };
    } catch {
      return null;
    }
  }
  if (ref.channelName) {
    const id = await findChannelIdByName(client, ref.channelName);
    if (!id) return null;
    return { id, name: ref.channelName };
  }
  return null;
}

async function channelName(client: WebClient, channelId: string): Promise<string | undefined> {
  try {
    const info = await client.conversations.info({ channel: channelId });
    return info.channel?.name;
  } catch {
    return undefined;
  }
}
