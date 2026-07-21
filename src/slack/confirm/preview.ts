import { producePreview } from "../../forge/pipeline.js";
import { docforgeDestroyDocument } from "../../service.js";
import { uploadPreviewToThread } from "../deliver/upload-preview.js";
import type { ForgeMessageContext } from "../types.js";

/**
 * Render page-1 PNG and upload to the confirm thread — one thumbnail, not a
 * telemetry wall. Skipped when FORGE_CONFIRM_PREVIEW=off (tests/CI).
 */
export async function postConfirmPreview(
  ctx: Pick<ForgeMessageContext, "client" | "logger">,
  input: {
    templateId: string;
    draftData: Record<string, unknown>;
    filename: string;
    replyChannelId: string;
    threadTs: string;
  },
): Promise<void> {
  if (process.env.FORGE_CONFIRM_PREVIEW === "off") return;

  let documentId: string | undefined;
  try {
    const preview = await producePreview(input.templateId, input.draftData);
    documentId = preview.documentId;
    const base = input.filename.replace(/\.pdf$/i, "");
    await uploadPreviewToThread({
      client: ctx.client,
      channelId: input.replyChannelId,
      threadTs: input.threadTs,
      previewPath: preview.previewPath,
      filename: `${base}-preview.png`,
      initialComment: "Page 1 preview — generate PDF when ready.",
    });
  } catch (err) {
    ctx.logger.debug?.("confirm preview skipped", err);
  } finally {
    if (documentId) {
      try {
        await docforgeDestroyDocument(documentId);
      } catch (err) {
        ctx.logger.debug?.("confirm preview cleanup skipped", err);
      }
    }
  }
}
