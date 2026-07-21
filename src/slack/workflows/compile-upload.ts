import { producePdf, ForgePipelineError } from "../../forge/pipeline.js";
import type { ForgeBuildReceipt, ForgeGatherProvenance } from "../../forge/receipt.js";
import { recordCompile } from "../../forge/health.js";
import { docforgeDestroyDocument } from "../../service.js";
import { setThreadWorkflowStatus } from "../agent/status.js";
import { buildDeliveryFeedbackBlocks } from "../confirm/feedback.js";
import { formatDeliverySummary } from "../confirm/delivery.js";
import { draftFilename } from "../confirm/draft.js";
import { uploadPdfToThread } from "../deliver/upload-pdf.js";
import { getThreadBrand } from "../brand/thread-brand.js";
import { createFinalizableDocument, type FinalizableWorkflow } from "../session.js";
import type { ForgeMessageContext } from "../types.js";

export type CompileUploadSpec = {
  workflow: FinalizableWorkflow;
  templateId: string;
  draftData: Record<string, unknown>;
  filename: string;
  replyChannelId: string;
  gather: ForgeGatherProvenance;
  errorLabel: string;
  uploadStatus: string;
  brandId?: string;
};

export async function compileAndUpload(
  ctx: Pick<ForgeMessageContext, "client" | "logger" | "say">,
  spec: CompileUploadSpec,
  threadTs: string,
): Promise<boolean> {
  let documentId: string;
  let pdfPath: string;
  let receipt: ForgeBuildReceipt;
  let via: "mcp" | "in-process" | undefined;
  const brandId = spec.brandId ?? getThreadBrand(spec.replyChannelId, threadTs)?.brandId;
  try {
    ({ documentId, pdfPath, receipt, via } = await producePdf(spec.templateId, spec.draftData, {
      workflow: spec.workflow,
      gather: spec.gather,
      brand_id: brandId,
    }));
    recordCompile({ ok: true, via });
  } catch (err) {
    recordCompile({ ok: false });
    const message =
      err instanceof ForgePipelineError
        ? err.message
        : err instanceof Error
          ? err.message
          : "DocForge pipeline failed.";
    ctx.logger.error(`${spec.workflow} producePdf failed`, err);
    await ctx.say({
      text: `Could not compile ${spec.errorLabel}: ${message}`,
      thread_ts: threadTs,
    });
    return false;
  }

  const summary = formatDeliverySummary({
    filename: spec.filename,
    receipt,
    draft: true,
  });
  let draftFileId: string | undefined;
  try {
    await setThreadWorkflowStatus({
      client: ctx.client,
      channelId: spec.replyChannelId,
      threadTs,
      status: spec.uploadStatus,
      logger: ctx.logger,
    });
    ({ fileId: draftFileId } = await uploadPdfToThread({
      client: ctx.client,
      channelId: spec.replyChannelId,
      threadTs,
      pdfPath,
      filename: draftFilename(spec.filename),
      initialComment: summary,
    }));
  } catch (err) {
    ctx.logger.error(`${spec.workflow} upload failed`, err);
    await destroyAfterFailedUpload(ctx, documentId);
    await ctx.say({
      text: `PDF compiled but upload failed: ${err instanceof Error ? err.message : String(err)}`,
      thread_ts: threadTs,
    });
    return false;
  }
  await destroyAfterSuccessfulUpload(ctx, documentId);

  const finalizable = createFinalizableDocument({
    workflow: spec.workflow,
    templateId: spec.templateId,
    draftData: spec.draftData,
    filename: spec.filename,
    draftFileId,
    replyChannelId: spec.replyChannelId,
    threadTs,
    buildReceipt: receipt,
    brandId,
  });

  await ctx.say({
    text: "Approve or request changes below.",
    thread_ts: threadTs,
    blocks: buildDeliveryFeedbackBlocks({
      finalizeId: finalizable.id,
      layoutWarnings: receipt.preflight.warning_count,
    }),
  });
  return true;
}

async function destroyAfterFailedUpload(
  ctx: Pick<ForgeMessageContext, "logger">,
  documentId: string,
): Promise<void> {
  try {
    await docforgeDestroyDocument(documentId);
  } catch (err) {
    ctx.logger.error("compiled document cleanup failed after upload failure", err);
  }
}

async function destroyAfterSuccessfulUpload(
  ctx: Pick<ForgeMessageContext, "logger">,
  documentId: string,
): Promise<void> {
  try {
    await docforgeDestroyDocument(documentId);
  } catch (err) {
    ctx.logger.error("compiled document cleanup failed after successful upload", err);
  }
}
