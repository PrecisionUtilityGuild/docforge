import type { KnownBlock } from "@slack/web-api";
import type { FormReplyTarget } from "./types.js";
import { encodeFormTarget } from "./types.js";

export function buildOpenDraftFormBlocks(target: FormReplyTarget): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "I need source notes to build a draft. Open the form or paste notes after `@forge draft`.",
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "forge_open_draft_form",
          text: { type: "plain_text", text: "Open draft form" },
          style: "primary",
          value: encodeFormTarget(target),
        },
      ],
    },
  ];
}

export function buildOpenMetricsFormBlocks(target: FormReplyTarget): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Board and metrics packs need a KPI CSV. Attach a file, paste a fenced block, or use the form.",
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "forge_open_metrics_form",
          text: { type: "plain_text", text: "Enter metrics" },
          style: "primary",
          value: encodeFormTarget(target),
        },
      ],
    },
  ];
}
