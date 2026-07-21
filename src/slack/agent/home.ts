import type { KnownBlock, View } from "@slack/web-api";
import { WORKFLOWS } from "../../forge/workflows.js";

const PITCH: Record<string, string> = {
  proposal: "Client-ready sales proposal from discovery + your pricing",
  incident: "Incident report from a channel's timeline",
  board: "Board KPI pack from your numbers",
  status: "Weekly RAG status from a channel's activity",
  draft: "A clean PDF from any pasted notes — I pick the format",
};

/**
 * The App Home tab — the "what is this and how do I start" surface. Block Kit, no
 * LLM. Generated from the workflow registry so a new workflow appears here too.
 */
export function buildHomeView(): View {
  const workflowBlocks: KnownBlock[] = WORKFLOWS.flatMap((w) => {
    const cmd = w.exampleCommand.replace(/^@forge\s+/i, "");
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${w.label}*\n${PITCH[w.id] ?? w.label}\n\`@forge ${cmd}\``,
        },
      } satisfies KnownBlock,
    ];
  });

  return {
    type: "home",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Forge — finish documents in Slack", emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Forge turns the context already in Slack into a finished, *reviewed* PDF. Mention `@forge` in any channel or DM to start.",
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*What I can make*" },
      },
      ...workflowBlocks,
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*How it works*\n1. I gather source and fit it to a template.\n2. You review a short summary, then *Generate PDF*.\n3. *Approve & finalize* when you're ready to send.",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Pricing, KPIs, and severities come only from your data — never invented. No external LLM.",
          },
        ],
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Quick start*" },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: "forge_home_open_draft_form",
            text: { type: "plain_text", text: "New document" },
            style: "primary",
          },
          {
            type: "button",
            action_id: "forge_home_open_metrics_form",
            text: { type: "plain_text", text: "Board / metrics pack" },
          },
        ],
      },
    ],
  };
}
