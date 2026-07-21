import { createReadStream } from "node:fs";
import type { WebClient } from "@slack/web-api";
import { extractFirstFileId } from "./upload-pdf.js";

export async function uploadJsonToThread(input: {
  client: WebClient;
  channelId: string;
  threadTs: string;
  jsonPath: string;
  filename: string;
  initialComment?: string;
}): Promise<{ fileId?: string }> {
  const res = (await input.client.files.uploadV2({
    channel_id: input.channelId,
    thread_ts: input.threadTs,
    file: createReadStream(input.jsonPath),
    filename: input.filename,
    initial_comment: input.initialComment ?? "Build receipt.",
  })) as { files?: Array<{ id?: string } | { files?: Array<{ id?: string }> }> };

  return { fileId: extractFirstFileId(res) };
}
