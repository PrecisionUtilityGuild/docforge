import type { View } from "@slack/web-api";
import { listTemplates } from "../../templates/registry.js";
import type { FormReplyTarget } from "./types.js";
import { encodeFormTarget } from "./types.js";

export const DRAFT_INTAKE_CALLBACK = "forge_draft_intake";

const PROSE_TEMPLATES: Array<{ id: string; label: string }> = [
  { id: "executive_memo", label: "Executive memo" },
  { id: "technical_note", label: "Technical note" },
  { id: "research_report", label: "Research report" },
  { id: "meeting_brief", label: "Meeting brief" },
  { id: "decision_record", label: "Decision record" },
];

const CHART_TEMPLATES: Array<{ id: string; label: string }> = [
  { id: "monthly_metrics", label: "Monthly metrics (CSV charts)" },
  { id: "kpi_report", label: "Board KPI pack" },
];

export async function buildDraftIntakeModal(target: FormReplyTarget): Promise<View> {
  const custom = (await listTemplates()).filter((t) => t.category === "custom").slice(0, 15);

  const optionGroups = [
    {
      label: { type: "plain_text" as const, text: "Routing" },
      options: [
        {
          text: { type: "plain_text" as const, text: "Auto-detect from notes" },
          value: "auto",
        },
      ],
    },
    {
      label: { type: "plain_text" as const, text: "Prose templates" },
      options: PROSE_TEMPLATES.map((t) => ({
        text: { type: "plain_text" as const, text: t.label },
        value: t.id,
      })),
    },
    {
      label: { type: "plain_text" as const, text: "Metrics & charts" },
      options: CHART_TEMPLATES.map((t) => ({
        text: { type: "plain_text" as const, text: t.label },
        value: t.id,
      })),
    },
    ...(custom.length
      ? [
          {
            label: { type: "plain_text" as const, text: "Custom templates" },
            options: custom.map((t) => ({
              text: { type: "plain_text" as const, text: t.name.slice(0, 75) },
              value: t.id,
            })),
          },
        ]
      : []),
  ];

  return {
    type: "modal",
    callback_id: DRAFT_INTAKE_CALLBACK,
    private_metadata: encodeFormTarget(target),
    title: { type: "plain_text", text: "New document" },
    submit: { type: "plain_text", text: "Build draft" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "template_block",
        optional: true,
        label: { type: "plain_text", text: "Template (optional)" },
        element: {
          type: "static_select",
          action_id: "template_select",
          placeholder: { type: "plain_text", text: "Auto-detect from notes" },
          option_groups: optionGroups,
          initial_option: optionGroups[0]!.options[0],
        },
      },
      {
        type: "input",
        block_id: "notes_block",
        label: { type: "plain_text", text: "Source notes or CSV" },
        hint: {
          type: "plain_text",
          text: "Paste notes, bullets, or a metric,value,target CSV block.",
        },
        element: {
          type: "plain_text_input",
          action_id: "notes_input",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "Weekly update:\n- Shipped auth refresh\n- Risk: onboarding backlog",
          },
        },
      },
    ],
  };
}

export function parseDraftIntakeSubmission(values: Record<string, Record<string, unknown>>): {
  templateId: string;
  notes: string;
} {
  const template =
    (values.template_block?.template_select as { selected_option?: { value?: string } })
      ?.selected_option?.value ?? "auto";
  const notes = String((values.notes_block?.notes_input as { value?: string })?.value ?? "").trim();
  return { templateId: template, notes };
}
