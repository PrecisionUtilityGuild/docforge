import type { KnownBlock } from "@slack/web-api";
import { formatEnginePreviewLine, formatSchemaFieldPreview } from "./engine-summary.js";

const RAG_EMOJI: Record<string, string> = { red: "🔴", amber: "🟠", green: "🟢" };

function ragLabel(rag: unknown): string {
  const key = typeof rag === "string" ? rag : "amber";
  return `${RAG_EMOJI[key] ?? "⚪️"} ${key}`;
}

function workstreamPreview(draftData: Record<string, unknown>, max = 4): string {
  const ws = draftData.workstreams as Array<{ name?: string; rag?: string }> | undefined;
  if (!ws?.length) return "_No workstreams parsed._";
  const lines = ws.slice(0, max).map((w) => `${RAG_EMOJI[w.rag ?? "amber"] ?? "⚪️"} ${w.name}`);
  const remainder = ws.length - max;
  if (remainder > 0) lines.push(`_…and ${remainder} more_`);
  return lines.join("\n");
}

export function buildStatusConfirmBlocks(input: {
  pendingId: string;
  channelLabel: string;
  lineCount: number;
  draftData: Record<string, unknown>;
  filename: string;
}): KnownBlock[] {
  const blockers = (input.draftData.blockers as string[] | undefined) ?? [];
  const fields = formatSchemaFieldPreview(input.draftData);

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Status — ${input.channelLabel}*\n` +
          `${ragLabel(input.draftData.overall_rag)} overall · \`${input.filename}\`\n` +
          `_${formatEnginePreviewLine({
            templateId: "project_status",
            draftData: input.draftData,
          })}_`,
      },
    },
  ];

  if (fields) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: fields } });
  }

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: workstreamPreview(input.draftData) },
  });

  if (blockers.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Blockers*\n${blockers
          .slice(0, 2)
          .map((b) => `• ${b}`)
          .join("\n")}`,
      },
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        action_id: "status_confirm",
        text: { type: "plain_text", text: "Generate PDF", emoji: true },
        style: "primary",
        value: input.pendingId,
      },
      {
        type: "button",
        action_id: "status_cancel",
        text: { type: "plain_text", text: "Cancel", emoji: true },
        value: input.pendingId,
      },
    ],
  });

  return blocks;
}
