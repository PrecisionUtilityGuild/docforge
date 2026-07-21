import { producePdf, ForgePipelineError, sealFinalReceipt } from "../../forge/pipeline.js";
import { compareDocumentData } from "../../versioning/diff.js";
import { docforgeDestroyDocument } from "../../service.js";
import { finalizeData, markTitleDraft, draftFilename } from "../confirm/draft.js";
import { buildDeliveryFeedbackBlocks, type FeedbackWorkflow } from "../confirm/feedback.js";
import { formatDeliverySummary } from "../confirm/delivery.js";
import { uploadPdfToThread } from "../deliver/upload-pdf.js";
import {
  createFinalizableDocument,
  type FinalizableDocument,
  type FinalizableWorkflow,
} from "../session.js";
import type { ForgeGatherProvenance } from "../../forge/receipt.js";
import type { ForgeMessageContext } from "../types.js";

const LABELS: Record<FeedbackWorkflow, string> = {
  proposal: "proposal",
  incident: "incident report",
  board: "board pack",
  status: "status report",
  draft: "draft PDF",
};

/**
 * Finalize a delivered DRAFT: re-export the SAME draft data with the DRAFT mark
 * removed (and an approved status), then upload the final PDF to the thread.
 */
export async function finalizeDocument(
  ctx: Pick<ForgeMessageContext, "client" | "logger" | "say">,
  doc: FinalizableDocument,
  approvedBy?: string,
): Promise<boolean> {
  const finalData = finalizeData(doc.draftData, doc.workflow);
  const sealOptions = doc.buildReceipt
    ? sealFinalReceipt(doc.buildReceipt, { approved_by: approvedBy ?? "unknown" })
    : undefined;

  let documentId: string;
  let pdfPath: string;
  let receipt;
  try {
    ({ documentId, pdfPath, receipt } = await producePdf(doc.templateId, finalData, {
      workflow: doc.workflow,
      gather: sealOptions?.gather ?? defaultGatherFromDraft(doc.draftData),
      brand_id: doc.brandId,
      review_state: "final",
      approved_by: approvedBy,
      approved_at: sealOptions?.approved_at,
      parent_build_id: sealOptions?.parent_build_id,
    }));
  } catch (err) {
    const message =
      err instanceof ForgePipelineError || err instanceof Error
        ? err.message
        : "DocForge pipeline failed.";
    ctx.logger.error("finalize producePdf failed", err);
    await ctx.say({
      text: `Could not finalize ${LABELS[doc.workflow]}: ${message} The delivered draft is unchanged.`,
      thread_ts: doc.threadTs,
    });
    return false;
  }

  const summary = formatDeliverySummary({
    filename: doc.filename,
    receipt,
    draft: false,
  });

  try {
    await uploadPdfToThread({
      client: ctx.client,
      channelId: doc.replyChannelId,
      threadTs: doc.threadTs,
      pdfPath,
      filename: doc.filename,
      initialComment: summary,
    });
  } catch (err) {
    ctx.logger.error("finalize upload failed", err);
    await cleanupGeneratedDocument(ctx, documentId, "finalize cleanup failed after upload failure");
    await ctx.say({
      text: `Finalized PDF compiled but upload failed: ${err instanceof Error ? err.message : String(err)}`,
      thread_ts: doc.threadTs,
    });
    return false;
  }
  await cleanupGeneratedDocument(
    ctx,
    documentId,
    "finalize cleanup failed after successful upload",
  );

  await deleteDraftFile(ctx, doc);
  return true;
}

async function deleteDraftFile(
  ctx: Pick<ForgeMessageContext, "client" | "logger">,
  doc: FinalizableDocument,
): Promise<void> {
  if (!doc.draftFileId) return;
  try {
    await ctx.client.files.delete({ file: doc.draftFileId });
  } catch (err) {
    ctx.logger.debug?.("draft file cleanup skipped", err);
  }
}

/**
 * Re-export an edited draft as a NEW draft with a version diff summary.
 */
export async function redeliverEditedDraft(
  ctx: Pick<ForgeMessageContext, "client" | "logger" | "say">,
  input: {
    workflow: FinalizableWorkflow;
    templateId: string;
    editedData: Record<string, unknown>;
    filename: string;
    replyChannelId: string;
    threadTs: string;
    previousDraftFileId?: string;
    previousDraftData?: Record<string, unknown>;
    previousReceipt?: FinalizableDocument["buildReceipt"];
    brandId?: string;
  },
): Promise<boolean> {
  const draftData = markTitleDraft(input.editedData);
  const versionDiff = input.previousDraftData
    ? (() => {
        const diff = compareDocumentData(input.previousDraftData, draftData);
        return {
          summary: diff.summary,
          field_changes: diff.data_changes.length,
          section_changes: diff.section_changes.length,
        };
      })()
    : undefined;

  const gather = input.previousReceipt
    ? {
        source_labels: input.previousReceipt.sources.labels,
        source_count: input.previousReceipt.sources.count,
        evidence_count: input.previousReceipt.sources.evidence_count,
        coverage: input.previousReceipt.sources.coverage,
        confidence: input.previousReceipt.sources.confidence,
        gather_method: input.previousReceipt.sources.gather_method,
        warnings: input.previousReceipt.sources.warnings,
      }
    : defaultGatherFromDraft(draftData);

  let documentId: string;
  let pdfPath: string;
  let receipt;
  try {
    ({ documentId, pdfPath, receipt } = await producePdf(input.templateId, draftData, {
      workflow: input.workflow,
      gather,
      brand_id: input.brandId,
      parent_build_id: input.previousReceipt?.build_id,
      version_diff: versionDiff,
    }));
  } catch (err) {
    const message =
      err instanceof ForgePipelineError || err instanceof Error
        ? err.message
        : "DocForge pipeline failed.";
    ctx.logger.error("edit re-export failed", err);
    await ctx.say({
      text: `Could not re-export the edited ${LABELS[input.workflow]}: ${message} The previous draft is unchanged.`,
      thread_ts: input.threadTs,
    });
    return false;
  }

  let draftFileId: string | undefined;
  try {
    const summary = formatDeliverySummary({
      filename: input.filename,
      receipt,
      draft: true,
    });
    ({ fileId: draftFileId } = await uploadPdfToThread({
      client: ctx.client,
      channelId: input.replyChannelId,
      threadTs: input.threadTs,
      pdfPath,
      filename: draftFilename(input.filename),
      initialComment: versionDiff ? `${summary} · ${versionDiff.summary}` : summary,
    }));
  } catch (err) {
    ctx.logger.error("edit re-export upload failed", err);
    await cleanupGeneratedDocument(ctx, documentId, "edit cleanup failed after upload failure");
    await ctx.say({
      text: `Revised PDF compiled but upload failed: ${err instanceof Error ? err.message : String(err)}`,
      thread_ts: input.threadTs,
    });
    return false;
  }
  await cleanupGeneratedDocument(ctx, documentId, "edit cleanup failed after successful upload");
  await deleteSupersededDraftFile(ctx, input.previousDraftFileId, draftFileId);

  const finalizable = createFinalizableDocument({
    workflow: input.workflow,
    templateId: input.templateId,
    draftData,
    filename: input.filename,
    draftFileId,
    replyChannelId: input.replyChannelId,
    threadTs: input.threadTs,
    buildReceipt: receipt,
    brandId: input.brandId,
  });

  await ctx.say({
    text: "Approve or request changes below.",
    thread_ts: input.threadTs,
    blocks: buildDeliveryFeedbackBlocks({
      finalizeId: finalizable.id,
      layoutWarnings: receipt.preflight.warning_count,
    }),
  });
  return true;
}

function defaultGatherFromDraft(draftData: Record<string, unknown>): ForgeGatherProvenance {
  const audit = draftData.source_audit as { evidence_count?: number } | undefined;
  const evidence = draftData.evidence;
  return {
    source_labels: ["stored draft data"],
    source_count:
      typeof audit?.evidence_count === "number"
        ? audit.evidence_count
        : Array.isArray(evidence)
          ? evidence.length
          : 1,
  };
}

async function deleteSupersededDraftFile(
  ctx: Pick<ForgeMessageContext, "client" | "logger">,
  previousDraftFileId: string | undefined,
  newDraftFileId: string | undefined,
): Promise<void> {
  if (!previousDraftFileId || previousDraftFileId === newDraftFileId) return;
  try {
    await ctx.client.files.delete({ file: previousDraftFileId });
  } catch (err) {
    ctx.logger.debug?.("superseded draft cleanup skipped", err);
  }
}

async function cleanupGeneratedDocument(
  ctx: Pick<ForgeMessageContext, "logger">,
  documentId: string,
  message: string,
): Promise<void> {
  try {
    await docforgeDestroyDocument(documentId);
  } catch (err) {
    ctx.logger.error(message, err);
  }
}
