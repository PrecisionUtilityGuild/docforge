import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { routeDocument } from "../../forge/document-router.js";
import {
  assessBoardCsv,
  extractBoardNotes,
  extractFencedCsv,
  parseBoardPeriod,
} from "../gather/board.js";
import type { SayFn } from "../types.js";
import {
  buildDraftIntakeModal,
  DRAFT_INTAKE_CALLBACK,
  parseDraftIntakeSubmission,
} from "../forms/draft-intake.js";
import { deliverBoardPack, deliverMetricsPack, deliverRoutedDraft } from "../forms/deliver.js";
import {
  buildMetricsIntakeModal,
  METRICS_INTAKE_CALLBACK,
  parseMetricsIntakeSubmission,
} from "../forms/metrics-intake.js";
import { decodeFormTarget, ensureFormReplyTarget, type FormReplyTarget } from "../forms/types.js";

function replyFn(client: WebClient, channelId: string): SayFn {
  return (args) =>
    client.chat.postMessage({
      channel: channelId,
      ...args,
    });
}

function buttonValue(action: { type: string; value?: string }): string | undefined {
  return action.type === "button" ? action.value : undefined;
}

function targetFromAction(
  body: {
    user: { id: string };
    channel?: { id?: string };
    message?: { thread_ts?: string; ts?: string };
  },
  encoded?: string,
): FormReplyTarget {
  const decoded = encoded ? decodeFormTarget(encoded) : undefined;
  if (decoded) return decoded;
  return {
    userId: body.user.id,
    channelId: body.channel?.id ?? "",
    threadTs: body.message?.thread_ts ?? body.message?.ts ?? "",
  };
}

async function openDraftForm(
  client: WebClient,
  triggerId: string,
  target: FormReplyTarget,
): Promise<void> {
  await client.views.open({
    trigger_id: triggerId,
    view: await buildDraftIntakeModal(target),
  });
}

async function openMetricsForm(
  client: WebClient,
  triggerId: string,
  target: FormReplyTarget,
): Promise<void> {
  await client.views.open({
    trigger_id: triggerId,
    view: buildMetricsIntakeModal(target),
  });
}

const DRAFT_OPEN_ACTIONS = ["forge_open_draft_form", "forge_home_open_draft_form"] as const;
const METRICS_OPEN_ACTIONS = ["forge_open_metrics_form", "forge_home_open_metrics_form"] as const;

export function registerFormListeners(app: App): void {
  for (const actionId of DRAFT_OPEN_ACTIONS) {
    app.action(actionId, async ({ ack, body, client }) => {
      await ack();
      if (body.type !== "block_actions" || !body.trigger_id) return;
      const encoded = buttonValue(body.actions[0]!);
      const target = targetFromAction(body, encoded);
      await openDraftForm(client, body.trigger_id, target);
    });
  }

  for (const actionId of METRICS_OPEN_ACTIONS) {
    app.action(actionId, async ({ ack, body, client }) => {
      await ack();
      if (body.type !== "block_actions" || !body.trigger_id) return;
      const encoded = buttonValue(body.actions[0]!);
      const target = targetFromAction(body, encoded);
      await openMetricsForm(client, body.trigger_id, target);
    });
  }

  app.view(DRAFT_INTAKE_CALLBACK, async ({ ack, view, client, logger }) => {
    const values = view.state.values as Record<string, Record<string, unknown>>;
    const { templateId, notes } = parseDraftIntakeSubmission(values);

    if (notes.replace(/\s+/g, " ").trim().length < 12) {
      await ack({
        response_action: "errors",
        errors: {
          notes_block: "Add a few lines of notes, bullets, or a CSV block.",
        },
      });
      return;
    }
    if (templateId === "kpi_report" || templateId === "monthly_metrics") {
      const csv = extractFencedCsv(notes) ?? notes;
      const quality = assessBoardCsv(csv);
      if (!quality.ok) {
        await ack({
          response_action: "errors",
          errors: {
            notes_block: quality.reason ?? "Paste KPI rows with metric and value columns.",
          },
        });
        return;
      }
    }
    await ack();

    const rawTarget = decodeFormTarget(view.private_metadata);
    if (!rawTarget) return;

    let target: FormReplyTarget;
    try {
      target = await ensureFormReplyTarget(client, rawTarget);
    } catch (err) {
      logger.error("draft form thread anchor failed", err);
      return;
    }

    const say = replyFn(client, target.channelId);
    const ctx = {
      client,
      logger,
      say,
      replyChannelId: target.channelId,
      threadTs: target.threadTs,
    };

    try {
      if (templateId === "kpi_report") {
        const csv = extractFencedCsv(notes) ?? notes;
        const period = parseBoardPeriod(notes);
        const commentary = extractBoardNotes(notes);
        await deliverBoardPack(ctx, { csv, notes: commentary, period });
        return;
      }

      if (templateId === "monthly_metrics") {
        const csv = extractFencedCsv(notes) ?? notes;
        const commentary = extractBoardNotes(notes);
        await deliverMetricsPack(ctx, {
          packKind: "monthly_metrics",
          period: parseBoardPeriod(notes),
          csv,
          commentary,
        });
        return;
      }

      const routed = await routeDocument({
        sourceText: notes,
        commandText: templateId !== "auto" ? `@forge document ${templateId}` : "@forge draft",
        explicitTemplateId: templateId !== "auto" ? templateId : undefined,
      });
      await deliverRoutedDraft(ctx, {
        routed,
        sourceText: notes,
        commandText: templateId !== "auto" ? `@forge document ${templateId}` : "@forge draft",
      });
    } catch (err) {
      logger.error("draft form delivery failed", err);
      await say({
        text: `Could not build draft: ${err instanceof Error ? err.message : String(err)}`,
        thread_ts: target.threadTs,
      });
    }
  });

  app.view(METRICS_INTAKE_CALLBACK, async ({ ack, view, client, logger }) => {
    const values = view.state.values as Record<string, Record<string, unknown>>;
    const parsed = parseMetricsIntakeSubmission(values);

    if (!parsed.period) {
      await ack({
        response_action: "errors",
        errors: { period_block: "Enter a period like 2026-Q1 or 2026-03." },
      });
      return;
    }
    if (parsed.csv.replace(/\s+/g, "").length < 8) {
      await ack({
        response_action: "errors",
        errors: { csv_block: "Paste KPI rows with a metric,value,target header." },
      });
      return;
    }
    const quality = assessBoardCsv(parsed.csv);
    if (!quality.ok) {
      await ack({
        response_action: "errors",
        errors: {
          csv_block: quality.reason ?? "Paste KPI rows with metric and value columns.",
        },
      });
      return;
    }
    await ack();

    const rawTarget = decodeFormTarget(view.private_metadata);
    if (!rawTarget) return;

    let target: FormReplyTarget;
    try {
      target = await ensureFormReplyTarget(client, rawTarget);
    } catch (err) {
      logger.error("metrics form thread anchor failed", err);
      return;
    }

    const say = replyFn(client, target.channelId);
    const ctx = {
      client,
      logger,
      say,
      replyChannelId: target.channelId,
      threadTs: target.threadTs,
    };

    try {
      await deliverMetricsPack(ctx, parsed);
    } catch (err) {
      logger.error("metrics form delivery failed", err);
      await say({
        text: `Could not build metrics pack: ${err instanceof Error ? err.message : String(err)}`,
        thread_ts: target.threadTs,
      });
    }
  });
}
