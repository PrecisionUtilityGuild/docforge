import { createReadStream } from "node:fs";
import type { WebClient } from "@slack/web-api";

/**
 * Upload a page-1 PNG preview to a thread. This is a render of what approval will
 * produce — not the deliverable PDF — so the "nothing is exported until you
 * approve" guarantee holds. Filename is suffixed -preview so it reads clearly.
 */
export async function uploadPreviewToThread(input: {
  client: WebClient;
  channelId: string;
  threadTs: string;
  previewPath: string;
  filename: string;
  initialComment?: string;
}): Promise<void> {
  await input.client.files.uploadV2({
    channel_id: input.channelId,
    thread_ts: input.threadTs,
    file: createReadStream(input.previewPath),
    filename: input.filename,
    initial_comment: input.initialComment ?? "Preview — approve to export the PDF.",
  });
}
