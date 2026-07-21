import type { WebAPICallResult, WebClient } from "@slack/web-api";
import type { ProposalSource } from "./proposal-context.js";
import { fetchChannelTranscript, type GatheredTranscript } from "./history.js";
import { linesToTranscript, type TranscriptLine } from "./transcript.js";

export type ProposalGatherMethod = "rts" | "history_fallback";

export type ProposalGatherResult = GatheredTranscript & {
  method: ProposalGatherMethod;
  label: string;
  rtsAttempted: boolean;
  rtsQuery: string;
  fallbackReason?: string;
};

type RtsRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RtsRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstString(record: RtsRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return undefined;
}

function candidateText(record: RtsRecord): string | undefined {
  const direct = firstString(record, ["text", "snippet", "summary", "content"]);
  if (direct) return direct;

  for (const key of ["message", "document", "item"]) {
    const child = record[key];
    if (isRecord(child)) {
      const nested = candidateText(child);
      if (nested) return nested;
    }
  }

  return undefined;
}

function candidateTs(record: RtsRecord, index: number): string {
  const direct = firstString(record, ["ts", "timestamp", "message_ts"]);
  if (direct) return direct;
  const child = record.message;
  if (isRecord(child)) {
    return firstString(child, ["ts", "timestamp", "message_ts"]) ?? `0.${index}`;
  }
  return `0.${index}`;
}

function candidateSpeaker(record: RtsRecord): string {
  const direct = firstString(record, [
    "user_name",
    "username",
    "author_name",
    "author",
    "user",
    "channel_name",
  ]);
  if (direct) return direct;
  const child = record.message;
  if (isRecord(child)) {
    return firstString(child, ["user_name", "username", "author_name", "author", "user"]) ?? "team";
  }
  return "team";
}

function candidateChannel(record: RtsRecord): string | undefined {
  const direct = firstString(record, ["channel_name", "channel"]);
  if (direct) return direct;
  const child = record.message;
  if (isRecord(child)) {
    return firstString(child, ["channel_name", "channel"]);
  }
  return undefined;
}

function sourceLabel(line: TranscriptLine): string {
  const channel = line.channel?.trim();
  if (channel) {
    if (channel.startsWith("#") || /^C[A-Z0-9]+$/.test(channel)) return channel;
    return `#${channel}`;
  }
  return line.speaker.trim() || "workspace";
}

function collectCandidateMessages(value: unknown, acc: RtsRecord[] = []): RtsRecord[] {
  if (Array.isArray(value)) {
    for (const item of value) collectCandidateMessages(item, acc);
    return acc;
  }

  if (!isRecord(value)) return acc;

  if (candidateText(value)) {
    acc.push(value);
  }

  for (const key of ["results", "messages", "matches", "items", "data", "contents"]) {
    const child = value[key];
    if (child) collectCandidateMessages(child, acc);
  }

  return acc;
}

export function rtsMessagesToTranscript(result: WebAPICallResult): GatheredTranscript {
  const records = collectCandidateMessages(result);
  const seen = new Set<string>();
  const lines: TranscriptLine[] = [];

  records.forEach((record, index) => {
    const text = candidateText(record);
    if (!text) return;

    const key = `${candidateTs(record, index)}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);

    lines.push({
      ts: candidateTs(record, index),
      speaker: candidateSpeaker(record),
      text,
      permalink: firstString(record, ["permalink", "permalink_public"]),
      channel: candidateChannel(record),
    });
  });

  return { lines, transcript: linesToTranscript(lines) };
}

/**
 * A clear provenance line for the thread. When Real-Time Search is used we say
 * so explicitly (with the hit count and the API method) rather than burying it
 * in a grey context label; the fallback path is equally explicit so the
 * behavior is never a black box.
 */
export function proposalGatherProvenance(result: ProposalGatherResult): string {
  if (result.method === "rts") {
    return (
      `🔎 Gathered ${result.lines.length} message${result.lines.length === 1 ? "" : "s"} via ` +
      `*Real-Time Search* (\`assistant.search.context\`) across the workspace.`
    );
  }
  const why = result.rtsAttempted
    ? `Real-Time Search returned nothing usable (${result.fallbackReason ?? "no results"})`
    : `no Real-Time Search token in this surface (${result.fallbackReason ?? "history only"})`;
  return `📚 Used channel history — ${why}.`;
}

/** Provenance line when Real-Time Search *added* cross-workspace evidence to an incident. */
export function incidentRtsProvenance(enrichment: IncidentRtsEnrichment): string | undefined {
  if (!enrichment.used) return undefined;
  const count = enrichment.relatedLines.length;
  const where = enrichment.sources.length ? ` from ${enrichment.sources.join(", ")}` : "";
  return (
    `🔎 *Real-Time Search* added ${count} related message${count === 1 ? "" : "s"}${where} ` +
    `(\`assistant.search.context\`) beyond the incident channel.`
  );
}

export function proposalRtsQuery(source: Exclude<ProposalSource, { kind: "unresolved" }>): string {
  return [
    source.clientName,
    source.channelName,
    "discovery requirements scope timeline integration SSO training",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function gatherProposalContext(input: {
  client: WebClient;
  source: Exclude<ProposalSource, { kind: "unresolved" }>;
  actionToken?: string;
  logger?: { warn?: (...args: unknown[]) => void };
}): Promise<ProposalGatherResult> {
  const rtsQuery = proposalRtsQuery(input.source);

  if (input.actionToken) {
    try {
      const result = await input.client.apiCall("assistant.search.context", {
        action_token: input.actionToken,
        query: rtsQuery,
        content_types: ["messages"],
        // Pull the messages around each hit (richer evidence) and cast a wider net.
        include_context_messages: true,
        limit: 20,
      });
      const gathered = rtsMessagesToTranscript(result);
      if (gathered.lines.length > 0) {
        return {
          ...gathered,
          method: "rts",
          label: `RTS search (${input.source.label})`,
          rtsAttempted: true,
          rtsQuery,
        };
      }
    } catch (err) {
      input.logger?.warn?.("proposal RTS gather failed; falling back to history", err);
      const gathered = await fetchChannelTranscript(input.client, input.source.channelId);
      return {
        ...gathered,
        method: "history_fallback",
        label: `history fallback (${input.source.label})`,
        rtsAttempted: true,
        rtsQuery,
        fallbackReason: "RTS call failed",
      };
    }

    const gathered = await fetchChannelTranscript(input.client, input.source.channelId);
    return {
      ...gathered,
      method: "history_fallback",
      label: `history fallback (${input.source.label})`,
      rtsAttempted: true,
      rtsQuery,
      fallbackReason: "RTS returned no usable message text",
    };
  }

  const gathered = await fetchChannelTranscript(input.client, input.source.channelId);
  return {
    ...gathered,
    method: "history_fallback",
    label: `history fallback (${input.source.label})`,
    rtsAttempted: false,
    rtsQuery,
    fallbackReason: "No Slack action_token in listener context",
  };
}

export type IncidentRtsEnrichment = {
  used: boolean;
  query: string;
  /** Extra context lines found across the workspace (deduped against history). */
  relatedLines: TranscriptLine[];
  /** Distinct channels/sources the related context came from. */
  sources: string[];
};

/**
 * Supplement the chronological channel history with Real-Time Search across the
 * whole workspace — related alerts, root-cause threads, or postmortem chatter
 * that live outside the incident channel. History stays the primary timeline;
 * RTS only *adds* evidence. Never throws: a failed/empty RTS returns used:false.
 */
export async function enrichIncidentWithRts(input: {
  client: WebClient;
  query: string;
  actionToken?: string;
  existing: TranscriptLine[];
  /** Optional incident time window (UNIX seconds) to scope the search and cut noise. */
  after?: number;
  before?: number;
  logger?: { warn?: (...args: unknown[]) => void };
}): Promise<IncidentRtsEnrichment> {
  const empty: IncidentRtsEnrichment = {
    used: false,
    query: input.query,
    relatedLines: [],
    sources: [],
  };
  if (!input.actionToken) return empty;

  try {
    const result = await input.client.apiCall("assistant.search.context", {
      action_token: input.actionToken,
      query: input.query,
      content_types: ["messages"],
      include_context_messages: true,
      // Chronological for incidents (timeline matters more than relevance score).
      sort: "timestamp",
      sort_dir: "asc",
      limit: 20,
      ...(input.after ? { after: input.after } : {}),
      ...(input.before ? { before: input.before } : {}),
    });
    const gathered = rtsMessagesToTranscript(result);
    if (gathered.lines.length === 0) return empty;

    // Drop anything already present in the channel history (by text).
    const seenText = new Set(input.existing.map((l) => l.text.trim()));
    const relatedLines = gathered.lines.filter((l) => !seenText.has(l.text.trim()));
    if (relatedLines.length === 0) return empty;

    const sources = [...new Set(relatedLines.map(sourceLabel))].slice(0, 6);
    return { used: true, query: input.query, relatedLines, sources };
  } catch (err) {
    input.logger?.warn?.("incident RTS enrichment failed; using history only", err);
    return empty;
  }
}
