import { createReadStream } from "node:fs";
import type { WebClient } from "@slack/web-api";

/**
 * Upload a PDF to a thread. Returns the uploaded file's id when Slack reports it
 * (uploadV2's response shape varies by SDK version, so we extract defensively) —
 * the caller uses it to clean up the DRAFT file once a final version replaces it.
 */
export async function uploadPdfToThread(input: {
  client: WebClient;
  channelId: string;
  threadTs: string;
  pdfPath: string;
  filename: string;
  initialComment?: string;
}): Promise<{ fileId?: string }> {
  const res = (await input.client.files.uploadV2({
    channel_id: input.channelId,
    thread_ts: input.threadTs,
    file: createReadStream(input.pdfPath),
    filename: input.filename,
    initial_comment: input.initialComment ?? "Document ready.",
  })) as { files?: Array<{ id?: string } | { files?: Array<{ id?: string }> }> };

  return { fileId: extractFirstFileId(res) };
}

/** uploadV2 may nest files as files[].id or files[].files[].id — handle both. */
export function extractFirstFileId(res: {
  files?: Array<{ id?: string } | { files?: Array<{ id?: string }> }>;
}): string | undefined {
  for (const entry of res.files ?? []) {
    if ("id" in entry && entry.id) return entry.id;
    if ("files" in entry && entry.files?.length) {
      const nested = entry.files.find((f) => f.id);
      if (nested?.id) return nested.id;
    }
  }
  return undefined;
}
