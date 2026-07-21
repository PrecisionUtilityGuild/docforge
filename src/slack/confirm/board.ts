import type { KnownBlock } from "@slack/web-api";
import type { BoardQuality } from "../gather/board.js";
import { formatEnginePreviewLine, formatSchemaFieldPreview } from "./engine-summary.js";

function kpiPreview(metricNames: string[], max = 4): string {
  const lines = metricNames.slice(0, max).map((name) => `• ${name}`);
  const remainder = metricNames.length - max;
  if (remainder > 0) lines.push(`_…and ${remainder} more_`);
  return lines.join("\n");
}

export function buildBoardConfirmBlocks(input: {
  pendingId: string;
  period: string;
  quality: BoardQuality;
  draftData: Record<string, unknown>;
  filename: string;
}): KnownBlock[] {
  const rowCount = Math.max(0, input.quality.lineCount - 1);
  const fields = formatSchemaFieldPreview(input.draftData);

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Board pack — ${input.period}*\n` +
          `${rowCount} KPI row${rowCount === 1 ? "" : "s"} · \`${input.filename}\`\n` +
          `_${formatEnginePreviewLine({
            templateId: "kpi_report",
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
      text: { type: "mrkdwn", text: kpiPreview(input.quality.metricNames) },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "board_confirm",
          text: { type: "plain_text", text: "Generate PDF", emoji: true },
          style: "primary",
          value: input.pendingId,
        },
        {
          type: "button",
          action_id: "board_cancel",
          text: { type: "plain_text", text: "Cancel", emoji: true },
          value: input.pendingId,
        },
      ],
    },
  );

  return blocks;
}
