import type { KnownBlock } from "@slack/web-api";
import type { TranscriptQuality } from "../gather/context.js";
import type { ResolvedIncidentSource } from "../session.js";
import { isRootCauseConfirmed } from "../gather/transcript.js";
import { formatEnginePreviewLine, formatSchemaFieldPreview } from "./engine-summary.js";

type TimelineEntry = { time: string; event: string };

function formatSourceLink(source: ResolvedIncidentSource): string {
  if (source.kind === "thread") return "_This thread_";
  if (source.channelId && source.channelName) {
    return `<#${source.channelId}|${source.channelName}>`;
  }
  return source.label;
}

function severityLabel(severity: unknown): string {
  const level = typeof severity === "string" ? severity.toLowerCase() : "high";
  const icons: Record<string, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
  };
  const icon = icons[level] ?? "🟠";
  const name = level.charAt(0).toUpperCase() + level.slice(1);
  return `${icon} ${name}`;
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function timelinePreview(
  draftData: Record<string, unknown>,
  maxLines = 3,
): { text: string; total: number } {
  const timeline = draftData.timeline as TimelineEntry[] | undefined;
  if (!timeline?.length) {
    return { text: "_No timeline events parsed._", total: 0 };
  }
  const lines = timeline
    .slice(0, maxLines)
    .map((entry) => `• \`${entry.time}\` ${truncate(entry.event, 72)}`);
  const remainder = timeline.length - maxLines;
  if (remainder > 0) {
    lines.push(`_…and ${remainder} more_`);
  }
  return { text: lines.join("\n"), total: timeline.length };
}

function rootCauseLine(transcript: string, draftData: Record<string, unknown>): string {
  const confirmed = isRootCauseConfirmed(transcript);
  const root =
    typeof draftData.root_cause === "string" ? truncate(draftData.root_cause, 100) : undefined;
  if (confirmed && root) return root;
  if (root) return `_Draft:_ ${root}`;
  return "_Not identified in source_";
}

export function buildIncidentConfirmBlocks(input: {
  pendingId: string;
  source: ResolvedIncidentSource;
  quality: TranscriptQuality;
  transcript: string;
  title: string;
  filename: string;
  draftData: Record<string, unknown>;
  templateId?: string;
}): KnownBlock[] {
  const preview = timelinePreview(input.draftData);
  const fields = formatSchemaFieldPreview(input.draftData);
  const templateId = input.templateId ?? "incident_report";

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${templateId === "postmortem" ? "Postmortem" : "Incident report"}*\n` +
          `${formatSourceLink(input.source)} · ${severityLabel(input.draftData.severity)} · \`${input.filename}\`\n` +
          `_${formatEnginePreviewLine({
            templateId,
            draftData: input.draftData,
          })}_`,
      },
    },
  ];

  if (fields) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: fields } });
  }

  blocks.push(
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Root cause*\n${rootCauseLine(input.transcript, input.draftData)}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Timeline* (${preview.total})\n${preview.text}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "incident_confirm",
          text: { type: "plain_text", text: "Generate PDF", emoji: true },
          style: "primary",
          value: input.pendingId,
        },
        {
          type: "button",
          action_id: "incident_cancel",
          text: { type: "plain_text", text: "Cancel", emoji: true },
          value: input.pendingId,
        },
      ],
    },
  );

  return blocks;
}
