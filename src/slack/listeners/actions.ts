import type { App } from "@slack/bolt";
import type { BlockAction } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { setThreadWorkflowStatus } from "../agent/status.js";
import { parsePricingLines } from "../gather/pricing.js";
import {
  createPendingDraft,
  createPendingDraftChoice,
  deletePendingProposal,
  getFinalizableDocument,
  getPendingDraft,
  getPendingProposal,
  takePendingDraft,
  takePendingDraftChoice,
  takeFinalizableDocument,
  takePendingBoardPack,
  takePendingIncident,
  takePendingProposalForConfirm,
  takePendingStatus,
  restoreFinalizableDocument,
} from "../session.js";
import { buildEditModal, applyEditValues, EDIT_MODAL_CALLBACK } from "../confirm/edit.js";
import { buildDraftChoiceBlocks, buildDraftConfirmBlocks } from "../confirm/freehand.js";
import { postConfirmPreview } from "../confirm/preview.js";
import { inferDraftDocument, isDraftTemplateId } from "../workflows/draft-inference.js";
import type { ForgeMessageContext, SayFn } from "../types.js";
import { compileAndUpload, type CompileUploadSpec } from "../workflows/compile-upload.js";
import { finalizeDocument, redeliverEditedDraft } from "../workflows/finalize.js";
import { applyLayoutRepairs } from "../confirm/layout-repair.js";
import { continueProposalWithPricing } from "../workflows/proposal.js";
import {
  gatherProvenanceFromBoard,
  gatherProvenanceFromDraft,
  gatherProvenanceFromIncident,
  gatherProvenanceFromProposal,
  gatherProvenanceFromStatus,
} from "../../forge/gather-provenance.js";

function buttonValue(action: BlockAction["actions"][number]): string | undefined {
  return action.type === "button" ? action.value : undefined;
}

function replyFn(client: WebClient, channelId: string): SayFn {
  return (args) =>
    client.chat.postMessage({
      channel: channelId,
      ...args,
    });
}

type ConfirmPending = { threadTs: string; replyChannelId: string };

/**
 * Registers a confirm-button handler for a workflow whose pending entry is held
 * in a claim-on-read store. All four workflows share the same flow — atomic
 * claim, expired-reply, status line, "approval received", then compile→upload —
 * and differ only in the strings derived from the claimed entry.
 */
function registerConfirm<P extends ConfirmPending>(
  app: App,
  config: {
    actionId: string;
    /** Atomically claim the pending entry; returns undefined if absent/expired/unconfirmable. */
    claim: (pendingId: string) => P | undefined;
    expiredText: string;
    /** Maps the claimed entry to its status line, ack line, and compile spec. */
    plan: (pending: P) => {
      status: string;
      loadingMessages?: string[];
      spec: Omit<CompileUploadSpec, "replyChannelId">;
    };
  },
): void {
  app.action(config.actionId, async ({ ack, body, client, logger }) => {
    await ack();
    if (body.type !== "block_actions" || !body.channel?.id) return;

    const pendingId = buttonValue(body.actions[0]);
    if (!pendingId) return;

    const pending = config.claim(pendingId);
    const say = replyFn(client, body.channel.id);
    const threadTs = body.message?.thread_ts ?? pending?.threadTs;

    if (!pending) {
      await say({ text: config.expiredText, thread_ts: threadTs });
      return;
    }

    const { status, loadingMessages, spec } = config.plan(pending);

    if (threadTs) {
      await setThreadWorkflowStatus({
        client,
        channelId: body.channel.id,
        threadTs,
        status,
        loadingMessages,
        logger,
      });
    }

    await compileAndUpload(
      { client, logger, say },
      { ...spec, replyChannelId: pending.replyChannelId },
      threadTs ?? pending.threadTs,
    );
  });
}

/** Registers a cancel-button handler that claims (drops) the pending entry and confirms no PDF. */
function registerCancel(
  app: App,
  config: { actionId: string; drop: (pendingId: string) => unknown },
): void {
  app.action(config.actionId, async ({ ack, body, client }) => {
    await ack();
    if (body.type !== "block_actions" || !body.channel?.id) return;

    const pendingId = buttonValue(body.actions[0]);
    if (pendingId) config.drop(pendingId);

    await client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: body.message?.thread_ts,
      text: "Cancelled — no PDF generated.",
    });
  });
}

export function registerActionListeners(app: App): void {
  app.action("forge_feedback_approved", async ({ ack, body, client, logger }) => {
    await ack();
    if (body.type !== "block_actions" || !body.channel?.id) return;

    const finalizeId = buttonValue(body.actions[0]);
    const say = replyFn(client, body.channel.id);
    const threadTs = body.message?.thread_ts;

    // Atomic claim — a double-clicked Approve can't re-export/upload twice.
    const doc = finalizeId ? takeFinalizableDocument(finalizeId) : undefined;
    if (!doc) {
      await say({
        text: "That draft is no longer available to finalize (already approved or expired). Re-run the workflow to produce a fresh draft.",
        thread_ts: threadTs,
      });
      return;
    }

    if (threadTs) {
      await setThreadWorkflowStatus({
        client,
        channelId: body.channel.id,
        threadTs,
        status: "Finalizing — removing DRAFT and re-exporting…",
        logger,
      });
    }

    await finalizeDocument({ client, logger, say }, doc, body.user.id);
  });

  app.action("forge_feedback_needs_changes", async ({ ack, body, client }) => {
    await ack();
    if (body.type !== "block_actions" || !body.trigger_id) return;

    const finalizeId = buttonValue(body.actions[0]);
    const doc = finalizeId ? getFinalizableDocument(finalizeId) : undefined;
    if (!doc) {
      if (body.channel?.id) {
        await client.chat.postMessage({
          channel: body.channel.id,
          thread_ts: body.message?.thread_ts,
          text: "That draft is no longer available to edit (already finalized or expired). Re-run the workflow to produce a fresh draft.",
        });
      }
      return;
    }

    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildEditModal({
        finalizeId: doc.id,
        workflow: doc.workflow,
        draftData: doc.draftData,
      }),
    });
  });

  app.action("forge_layout_repair", async ({ ack, body, client, logger }) => {
    await ack();
    if (body.type !== "block_actions" || !body.channel?.id) return;

    const finalizeId = buttonValue(body.actions[0]);
    const doc = finalizeId ? takeFinalizableDocument(finalizeId) : undefined;
    if (!doc) {
      await client.chat.postMessage({
        channel: body.channel.id,
        thread_ts: body.message?.thread_ts,
        text: "That draft is no longer available for layout repair.",
      });
      return;
    }

    const say = replyFn(client, doc.replyChannelId);
    const repaired = applyLayoutRepairs(doc.draftData);
    try {
      const ok = await redeliverEditedDraft(
        { client, logger, say },
        {
          workflow: doc.workflow,
          templateId: doc.templateId,
          editedData: repaired,
          filename: doc.filename,
          replyChannelId: doc.replyChannelId,
          threadTs: doc.threadTs,
          previousDraftFileId: doc.draftFileId,
          previousDraftData: doc.draftData,
          previousReceipt: doc.buildReceipt,
          brandId: doc.brandId,
        },
      );
      if (!ok) restoreFinalizableDocument(doc);
    } catch (err) {
      logger.error("layout repair failed", err);
      restoreFinalizableDocument(doc);
      await say({
        text: `Layout repair failed: ${err instanceof Error ? err.message : String(err)}`,
        thread_ts: doc.threadTs,
      });
    }
  });

  app.view(EDIT_MODAL_CALLBACK, async ({ ack, view, client, logger }) => {
    await ack();
    const finalizeId = view.private_metadata;
    // Claim the held draft now so a parallel Approve can't race the re-export.
    const doc = takeFinalizableDocument(finalizeId);
    if (!doc) return;

    const editedData = applyEditValues({
      workflow: doc.workflow,
      draftData: doc.draftData,
      values: view.state.values as Record<string, Record<string, { value?: string }>>,
    });

    const say = replyFn(client, doc.replyChannelId);
    try {
      const redelivered = await redeliverEditedDraft(
        { client, logger, say },
        {
          workflow: doc.workflow,
          templateId: doc.templateId,
          editedData,
          filename: doc.filename,
          replyChannelId: doc.replyChannelId,
          threadTs: doc.threadTs,
          previousDraftFileId: doc.draftFileId,
          previousDraftData: doc.draftData,
          previousReceipt: doc.buildReceipt,
          brandId: doc.brandId,
        },
      );
      if (!redelivered) restoreFinalizableDocument(doc);
    } catch (err) {
      restoreFinalizableDocument(doc);
      logger.error("edit re-export handler failed", err);
      await say({
        text: "Could not re-export the edited draft. The previous draft is unchanged and can still be approved.",
        thread_ts: doc.threadTs,
      });
    }
  });

  registerConfirm(app, {
    actionId: "incident_confirm",
    // Claim-on-read removes the pending entry atomically so a double-clicked
    // Approve (or a redelivered Slack event) cannot compile/upload twice.
    claim: takePendingIncident,
    expiredText: "That confirmation expired. Run the incident command again.",
    plan: (pending) => ({
      status: "Compiling incident report…",
      loadingMessages: [
        "Validating incident_report schema…",
        "Checking timeline and evidence grounding…",
        "Rendering PDF draft with DocForge…",
      ],
      spec: {
        workflow: "incident",
        templateId: pending.templateId,
        draftData: pending.draftData,
        filename: pending.filename,
        gather: gatherProvenanceFromIncident(pending),
        errorLabel: "incident report",
        uploadStatus: "Uploading PDF…",
      },
    }),
  });

  registerConfirm(app, {
    actionId: "proposal_confirm",
    claim: takePendingProposalForConfirm,
    expiredText: "That confirmation expired. Run the proposal command again.",
    plan: (pending) => ({
      status: "Compiling proposal…",
      loadingMessages: [
        "Validating proposal scope and pricing…",
        "Rendering sales_proposal PDF draft…",
        "Preparing Slack upload…",
      ],
      spec: {
        workflow: "proposal",
        draftData: pending.draftData!,
        templateId: "sales_proposal",
        filename: pending.filename,
        gather: gatherProvenanceFromProposal(pending),
        errorLabel: "proposal",
        uploadStatus: "Uploading PDF…",
      },
    }),
  });

  registerConfirm(app, {
    actionId: "board_confirm",
    claim: takePendingBoardPack,
    expiredText: "That confirmation expired. Run the board pack command again.",
    plan: (pending) => ({
      status: "Compiling board pack…",
      loadingMessages: [
        "Validating KPI CSV values…",
        "Rendering kpi_report charts…",
        "Preparing Slack upload…",
      ],
      spec: {
        workflow: "board",
        templateId: "kpi_report",
        draftData: pending.draftData,
        filename: pending.filename,
        gather: gatherProvenanceFromBoard(pending),
        errorLabel: "board pack",
        uploadStatus: "Uploading PDF…",
      },
    }),
  });

  registerConfirm(app, {
    actionId: "draft_confirm",
    claim: takePendingDraft,
    expiredText: "That draft request expired. Run `@forge draft` again.",
    plan: (pending) => ({
      status: `Compiling ${pending.templateLabel.toLowerCase()}…`,
      loadingMessages: [
        `Validating ${pending.templateLabel} data…`,
        "Rendering PDF draft with DocForge…",
        "Preparing Slack upload…",
      ],
      spec: {
        workflow: "draft",
        templateId: pending.templateId,
        draftData: pending.draftData,
        filename: pending.filename,
        gather: gatherProvenanceFromDraft(pending),
        errorLabel: "draft PDF",
        uploadStatus: "Uploading PDF…",
      },
    }),
  });

  registerConfirm(app, {
    actionId: "status_confirm",
    claim: takePendingStatus,
    expiredText: "That confirmation expired. Run the status command again.",
    plan: (pending) => ({
      status: "Compiling status report…",
      loadingMessages: [
        "Validating project_status schema…",
        "Checking workstreams and blockers…",
        "Rendering PDF draft with DocForge…",
      ],
      spec: {
        workflow: "status",
        templateId: "project_status",
        draftData: pending.draftData,
        filename: pending.filename,
        gather: gatherProvenanceFromStatus(pending),
        errorLabel: "status report",
        uploadStatus: "Uploading PDF…",
      },
    }),
  });

  app.action("proposal_open_pricing_modal", async ({ ack, body, client }) => {
    await ack();
    if (body.type !== "block_actions" || !body.trigger_id) return;

    const pendingId = buttonValue(body.actions[0]);
    if (!pendingId) return;

    const pending = getPendingProposal(pendingId);
    if (!pending && body.channel?.id) {
      await client.chat.postMessage({
        channel: body.channel.id,
        thread_ts: body.message?.thread_ts,
        text: "That proposal session expired. Run the proposal command again.",
      });
      return;
    }

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "proposal_pricing_modal",
        private_metadata: pendingId,
        title: { type: "plain_text", text: "Proposal pricing" },
        submit: { type: "plain_text", text: "Continue" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: "pricing_block",
            label: { type: "plain_text", text: "Line items (one per line)" },
            element: {
              type: "plain_text_input",
              action_id: "pricing_input",
              multiline: true,
              placeholder: {
                type: "plain_text",
                text: "Solution engineering — $96000",
              },
            },
          },
        ],
      },
    });
  });

  app.view("proposal_pricing_modal", async ({ ack, view, client, logger }) => {
    const pricingText = view.state.values.pricing_block?.pricing_input?.value ?? "";
    if (parsePricingLines(pricingText).length === 0) {
      await ack({
        response_action: "errors",
        errors: {
          pricing_block: "Add lines like: Solution engineering — $96000",
        },
      });
      return;
    }
    await ack();

    const pendingId = view.private_metadata;
    const pending = getPendingProposal(pendingId);
    if (!pending) return;

    const say = replyFn(client, pending.replyChannelId);
    const ctx: ForgeMessageContext = {
      text: pricingText,
      threadTs: pending.threadTs,
      replyChannelId: pending.replyChannelId,
      isDm: false,
      inThread: true,
      threadParentTs: pending.threadTs,
      say,
      client,
      logger,
    };
    await continueProposalWithPricing(ctx, pendingId, pricingText);
  });

  registerCancel(app, { actionId: "proposal_cancel", drop: deletePendingProposal });
  registerCancel(app, { actionId: "incident_cancel", drop: takePendingIncident });
  registerCancel(app, { actionId: "board_cancel", drop: takePendingBoardPack });
  registerCancel(app, { actionId: "draft_cancel", drop: takePendingDraft });
  registerCancel(app, { actionId: "status_cancel", drop: takePendingStatus });

  // Low-confidence picker: rebuild the draft with the user's chosen template from
  // the same held source text, then fall into the normal confirm-before-export
  // flow. action_id is draft_pick_<templateId>; value is "<choiceId>::<templateId>".
  app.action(/^draft_pick_/, async ({ ack, body, client, logger }) => {
    await ack();
    if (body.type !== "block_actions" || !body.channel?.id) return;

    const raw = buttonValue(body.actions[0]);
    const [choiceId, templateId] = raw?.split("::") ?? [];
    if (!choiceId || !templateId || !isDraftTemplateId(templateId)) return;

    const say = replyFn(client, body.channel.id);
    const choice = takePendingDraftChoice(choiceId);
    const threadTs = body.message?.thread_ts ?? choice?.threadTs;

    if (!choice) {
      await say({
        text: "That draft choice expired. Run `@forge draft` again.",
        thread_ts: threadTs,
      });
      return;
    }

    const inference = inferDraftDocument(choice.sourceText, new Date(), templateId);
    const pending = createPendingDraft({
      templateId: inference.templateId,
      templateLabel: inference.templateLabel,
      draftData: inference.draftData,
      filename: inference.filename,
      sourceText: choice.sourceText,
      replyChannelId: choice.replyChannelId,
      threadTs: choice.threadTs,
    });

    await say({
      text: `${inference.templateLabel} — review and generate when ready.`,
      thread_ts: threadTs,
      blocks: buildDraftConfirmBlocks({ pendingId: pending.id, inference }),
    });

    await postConfirmPreview(
      { client, logger },
      {
        templateId: inference.templateId,
        draftData: inference.draftData,
        filename: inference.filename,
        replyChannelId: choice.replyChannelId,
        threadTs: choice.threadTs,
      },
    );
  });

  app.action("draft_retemplate", async ({ ack, body, client }) => {
    await ack();
    if (body.type !== "block_actions" || !body.channel?.id) return;

    const pendingId = buttonValue(body.actions[0]);
    const pending = pendingId ? getPendingDraft(pendingId) : undefined;
    const threadTs = body.message?.thread_ts ?? pending?.threadTs;

    if (!pending?.sourceText) {
      await client.chat.postMessage({
        channel: body.channel.id,
        thread_ts: threadTs,
        text: "Can't change template — re-run `@forge draft` with your notes.",
      });
      return;
    }

    takePendingDraft(pendingId!);
    const inference = inferDraftDocument(pending.sourceText);
    const choice = createPendingDraftChoice({
      sourceText: pending.sourceText,
      replyChannelId: pending.replyChannelId,
      threadTs: pending.threadTs,
    });

    const say = replyFn(client, body.channel.id);
    await say({
      text: "Pick a different template — same source notes.",
      thread_ts: threadTs,
      blocks: buildDraftChoiceBlocks({
        choiceId: choice.id,
        inference: { ...inference, ambiguous: true },
      }),
    });
  });
}
