import type { KnownBlock } from "@slack/web-api";

export function buildPricingPromptBlocks(pendingId: string): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Pricing needed* — reply in this thread or click *Enter pricing*.\n`Item — $amount` per line.",
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "proposal_open_pricing_modal",
          text: { type: "plain_text", text: "Enter pricing" },
          style: "primary",
          value: pendingId,
        },
      ],
    },
  ];
}
