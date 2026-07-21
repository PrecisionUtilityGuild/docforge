import type { View } from "@slack/web-api";
import type { FormReplyTarget } from "./types.js";
import { encodeFormTarget } from "./types.js";

export const METRICS_INTAKE_CALLBACK = "forge_metrics_intake";

export type MetricsPackKind = "kpi_report" | "monthly_metrics";

export function buildMetricsIntakeModal(target: FormReplyTarget): View {
  return {
    type: "modal",
    callback_id: METRICS_INTAKE_CALLBACK,
    private_metadata: encodeFormTarget(target),
    title: { type: "plain_text", text: "Metrics pack" },
    submit: { type: "plain_text", text: "Build draft" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "pack_block",
        label: { type: "plain_text", text: "Pack type" },
        element: {
          type: "static_select",
          action_id: "pack_select",
          options: [
            {
              text: { type: "plain_text", text: "Board KPI pack" },
              value: "kpi_report",
            },
            {
              text: { type: "plain_text", text: "Monthly metrics (bar charts)" },
              value: "monthly_metrics",
            },
          ],
          initial_option: {
            text: { type: "plain_text", text: "Board KPI pack" },
            value: "kpi_report",
          },
        },
      },
      {
        type: "input",
        block_id: "period_block",
        label: { type: "plain_text", text: "Period" },
        element: {
          type: "plain_text_input",
          action_id: "period_input",
          placeholder: { type: "plain_text", text: "2026-Q1 or 2026-03" },
        },
      },
      {
        type: "input",
        block_id: "csv_block",
        label: { type: "plain_text", text: "KPI CSV" },
        hint: {
          type: "plain_text",
          text: "Header row: metric,value,target,trend,unit",
        },
        element: {
          type: "plain_text_input",
          action_id: "csv_input",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "metric,value,target,trend,unit\nARR,4.2,4.0,up,USD",
          },
        },
      },
      {
        type: "input",
        block_id: "commentary_block",
        optional: true,
        label: { type: "plain_text", text: "Commentary (optional)" },
        element: {
          type: "plain_text_input",
          action_id: "commentary_input",
          multiline: true,
        },
      },
    ],
  };
}

export function parseMetricsIntakeSubmission(values: Record<string, Record<string, unknown>>): {
  packKind: MetricsPackKind;
  period: string;
  csv: string;
  commentary: string;
} {
  const packKind = ((values.pack_block?.pack_select as { selected_option?: { value?: string } })
    ?.selected_option?.value ?? "kpi_report") as MetricsPackKind;
  const period = String(
    (values.period_block?.period_input as { value?: string })?.value ?? "",
  ).trim();
  const csv = String((values.csv_block?.csv_input as { value?: string })?.value ?? "").trim();
  const commentary = String(
    (values.commentary_block?.commentary_input as { value?: string })?.value ?? "",
  ).trim();
  return { packKind, period, csv, commentary };
}
