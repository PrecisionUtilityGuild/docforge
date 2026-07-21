import type { WebClient } from "@slack/web-api";
import { maxCsvAttachmentBytes } from "../../security/limits.js";
import type { SlackInputFile } from "./board.js";

function downloadToken(): string | undefined {
  return process.env.SLACK_BOT_TOKEN?.trim();
}

/**
 * Only ever attach the bot token to a Slack-owned host. `url_private_download`
 * comes from the event/files.info payload; even though inbound events are
 * signature-verified, the bot token must never ride on a request to a host we
 * did not pin (defense-in-depth against a crafted file object or future reuse).
 */
function assertSlackHost(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Slack file download URL is malformed.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Slack file download URL must be https.");
  }
  const host = url.hostname.toLowerCase();
  if (host !== "slack.com" && !host.endsWith(".slack.com")) {
    throw new Error("Refusing to download file from non-Slack host.");
  }
  return url;
}

export async function downloadSlackTextFile(
  client: WebClient,
  file: SlackInputFile,
): Promise<string> {
  let url = file.url_private_download;

  if (!url && file.id) {
    const info = await client.files.info({ file: file.id });
    const slackFile = info.file as SlackInputFile | undefined;
    url = slackFile?.url_private_download;
  }

  if (!url) {
    throw new Error("Slack file has no private download URL.");
  }

  const safeUrl = assertSlackHost(url);

  const token = downloadToken();
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is required to download uploaded CSV files.");
  }

  const response = await fetch(safeUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Slack file download failed (${response.status}).`);
  }

  const maxBytes = maxCsvAttachmentBytes();
  // Reject oversized files up front when Slack advertises the length…
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`Attached file exceeds the ${maxBytes}-byte limit for CSV uploads.`);
  }

  // …and enforce the cap while streaming, so a missing/lying header can't bypass it.
  return readCapped(response, maxBytes);
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  if (!body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new Error(`Attached file exceeds the ${maxBytes}-byte limit for CSV uploads.`);
    }
    return text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          throw new Error(`Attached file exceeds the ${maxBytes}-byte limit for CSV uploads.`);
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}
