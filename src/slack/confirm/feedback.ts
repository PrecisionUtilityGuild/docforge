import type { ActionsBlock, KnownBlock } from "@slack/web-api";
import type { ForgeBuildReceipt } from "../../forge/receipt.js";
import type { FinalizableWorkflow } from "../session.js";
import { formatDeliverySummary } from "./delivery.js";

export type FeedbackWorkflow = FinalizableWorkflow;

export function buildDeliveryFeedbackBlocks(input: {
  finalizeId: string;
  layoutWarnings?: number;
}): KnownBlock[] {
  const elements: ActionsBlock["elements"] = [
    {
      type: "button",
      action_id: "forge_feedback_approved",
      text: { type: "plain_text", text: "Approve & finalize" },
      style: "primary",
      value: input.finalizeId,
    },
    {
      type: "button",
      action_id: "forge_feedback_needs_changes",
      text: { type: "plain_text", text: "Needs changes" },
      value: input.finalizeId,
    },
  ];

  if ((input.layoutWarnings ?? 0) > 0) {
    elements.push({
      type: "button",
      action_id: "forge_layout_repair",
      text: { type: "plain_text", text: "Fix layout" },
      value: input.finalizeId,
    });
  }

  return [{ type: "actions", elements }];
}

export function buildFinalizedSummary(input: {
  filename: string;
  receipt?: ForgeBuildReceipt;
}): string {
  if (input.receipt) {
    return formatDeliverySummary({
      filename: input.filename,
      receipt: input.receipt,
      draft: false,
    });
  }
  return `Final · \`${input.filename}\` · DRAFT removed`;
}
