import type { KnownBlock } from "@slack/web-api";
import type { DraftInference } from "../workflows/draft-inference.js";
import { formatEnginePreviewLine, formatSchemaFieldPreview } from "./engine-summary.js";

type DraftActionElement = {
  type: "button";
  action_id: string;
  text: { type: "plain_text"; text: string };
  style?: "primary";
  value: string;
};

export function buildDraftChoiceBlocks(input: {
  choiceId: string;
  inference: DraftInference;
}): KnownBlock[] {
  const { inference } = input;
  const best = inference.candidates[0]?.label ?? inference.templateLabel;
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Which format?* Best guess: *${best}* — pick one and I'll build it (no PDF until you confirm).`,
      },
    },
    {
      type: "actions",
      elements: inference.candidates.map((candidate) => ({
        type: "button" as const,
        action_id: `draft_pick_${candidate.templateId}`,
        text: { type: "plain_text" as const, text: candidate.label },
        value: `${input.choiceId}::${candidate.templateId}`,
      })),
    },
  ];
}

export function buildDraftConfirmBlocks(input: {
  pendingId: string;
  inference: DraftInference;
  allowRetemplate?: boolean;
}): KnownBlock[] {
  const { inference } = input;
  const title = typeof inference.draftData.title === "string" ? inference.draftData.title : "Draft";
  const fields = formatSchemaFieldPreview(inference.draftData);

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${title}*\n` +
          `${inference.templateLabel} · \`${inference.filename}\`\n` +
          `_${formatEnginePreviewLine({
            templateId: inference.templateId,
            draftData: inference.draftData,
          })}_`,
      },
    },
  ];

  if (fields) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: fields },
    });
  }

  const actionElements: DraftActionElement[] = [
    {
      type: "button" as const,
      action_id: "draft_confirm",
      text: { type: "plain_text" as const, text: "Generate PDF" },
      style: "primary" as const,
      value: input.pendingId,
    },
  ];

  if (input.allowRetemplate !== false) {
    actionElements.push({
      type: "button" as const,
      action_id: "draft_retemplate",
      text: { type: "plain_text" as const, text: "Change template" },
      value: input.pendingId,
    });
  }

  actionElements.push({
    type: "button" as const,
    action_id: "draft_cancel",
    text: { type: "plain_text" as const, text: "Cancel" },
    value: input.pendingId,
  });

  blocks.push({
    type: "actions",
    elements: actionElements,
  });

  return blocks;
}
