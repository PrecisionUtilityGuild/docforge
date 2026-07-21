import type { KnownBlock } from "@slack/web-api";
import type { TranscriptQuality } from "../gather/context.js";
import { pricingSubtotal, type PricingRow } from "../gather/pricing.js";
import type { ProposalEvidenceSnippet, ProposalSource } from "../gather/proposal-context.js";
import { formatEnginePreviewLine, formatSchemaFieldPreview } from "./engine-summary.js";

function formatMoney(total: number): string {
  return `$${total.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function scopePreview(draftData: Record<string, unknown>, max = 3): string {
  const scope = draftData.scope as Array<{ item: string }> | undefined;
  if (!scope?.length) return "_No scope items parsed._";
  const lines = scope.slice(0, max).map((row) => `• ${row.item}`);
  const remainder = scope.length - max;
  if (remainder > 0) {
    lines.push(`_…and ${remainder} more_`);
  }
  return lines.join("\n");
}

export function buildProposalConfirmBlocks(input: {
  pendingId: string;
  source: Exclude<ProposalSource, { kind: "unresolved" }>;
  quality: TranscriptQuality;
  pricingRows: PricingRow[];
  draftData: Record<string, unknown>;
  filename: string;
  contextLabel?: string;
  evidenceSnippets?: ProposalEvidenceSnippet[];
}): KnownBlock[] {
  const client = (input.draftData.client as { name?: string })?.name ?? input.source.clientName;
  const subtotal = pricingSubtotal(input.pricingRows);
  const totalLabel = formatMoney(Math.round(subtotal));
  const fields = formatSchemaFieldPreview(input.draftData);

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Proposal — ${client}*\n` +
          `<#${input.source.channelId}|${input.source.channelName}> · ` +
          `${input.pricingRows.length} line item${input.pricingRows.length === 1 ? "" : "s"} · *${totalLabel}* · \`${input.filename}\`\n` +
          `_${formatEnginePreviewLine({
            templateId: "sales_proposal",
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
      text: { type: "mrkdwn", text: scopePreview(input.draftData) },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "proposal_confirm",
          text: { type: "plain_text", text: "Generate PDF", emoji: true },
          style: "primary",
          value: input.pendingId,
        },
        {
          type: "button",
          action_id: "proposal_cancel",
          text: { type: "plain_text", text: "Cancel", emoji: true },
          value: input.pendingId,
        },
      ],
    },
  );

  return blocks;
}
