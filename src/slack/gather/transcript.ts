import type { TimelineEntry } from "../../workflow-mappers/incident-parse.js";
import { stripEmojiShortcodes, stripSlackMarkup } from "./slack-markup.js";

export type TranscriptLine = {
  ts: string;
  text: string;
  speaker: string;
  /** Provenance (RTS results): permalink + channel of the source message, for citation. */
  permalink?: string;
  channel?: string;
};

export function slackTsToClock(ts: string): string {
  const seconds = Number(ts.split(".")[0]);
  const date = new Date(seconds * 1000);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Remove timestamped `14:02 ` prefixes pasted into message bodies. */
export function stripEmbeddedTimePrefix(text: string): string {
  return text.trim().replace(/^\d{1,2}:\d{2}\s+/, "");
}

function formatEvent(speaker: string, text: string): string {
  const body = stripEmojiShortcodes(stripEmbeddedTimePrefix(stripSlackMarkup(text)));
  if (/^(@[\w-]+|[A-Za-z][\w-]*):/.test(body)) {
    return body;
  }
  return `${speaker}: ${body}`;
}

export function expandMultilineMessages(lines: TranscriptLine[]): TranscriptLine[] {
  const expanded: TranscriptLine[] = [];
  for (const line of lines) {
    const parts = line.text
      .split(/\r?\n/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length <= 1) {
      expanded.push(line);
      continue;
    }
    for (const part of parts) {
      expanded.push({ ...line, text: part });
    }
  }
  return expanded;
}

export function formatTranscriptLine(line: TranscriptLine): string {
  return `${slackTsToClock(line.ts)} ${formatEvent(line.speaker, line.text)}`;
}

export function linesToTranscript(lines: TranscriptLine[]): string {
  return expandMultilineMessages(lines).map(formatTranscriptLine).filter(Boolean).join("\n");
}

export function linesToTimeline(lines: TranscriptLine[]): TimelineEntry[] {
  return expandMultilineMessages(lines).map((line) => ({
    time: slackTsToClock(line.ts),
    event: formatEvent(line.speaker, line.text),
  }));
}

export function durationFromTranscriptLines(lines: TranscriptLine[]): string | undefined {
  const expanded = expandMultilineMessages(lines).filter((line) => line.ts && line.ts !== "0");
  if (expanded.length < 2) return undefined;
  const spanSec = Number(expanded[expanded.length - 1].ts) - Number(expanded[0].ts);
  const minutes = Math.round(spanSec / 60);
  return minutes > 0 ? `${minutes} minutes` : undefined;
}

export { isRootCauseConfirmed } from "../../workflow-mappers/incident-parse.js";
export { stripEmojiShortcodes } from "./slack-markup.js";
