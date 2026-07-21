import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WebClient } from "@slack/web-api";
import { getDataRoot } from "../../config.js";
import { assertAllowedAssetMime, assertAssetSize, sniffImageMime } from "../../security/limits.js";
import type { SlackInputFile } from "./board.js";

const IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

function downloadToken(): string | undefined {
  return process.env.SLACK_BOT_TOKEN?.trim();
}

function assertSlackHost(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Slack file download URL must be https.");
  const host = url.hostname.toLowerCase();
  if (host !== "slack.com" && !host.endsWith(".slack.com")) {
    throw new Error("Refusing to download file from non-Slack host.");
  }
  return url;
}

function extensionForMime(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/svg+xml") return ".svg";
  return ".img";
}

/**
 * Download the first image attachment from a Slack message to a workspace-local
 * path under DOCFORGE_DATA_ROOT (allowed root for brand extraction).
 */
export async function downloadSlackLogoFile(
  client: WebClient,
  files: SlackInputFile[] | undefined,
  brandId: string,
): Promise<string | undefined> {
  if (!files?.length) return undefined;

  const image = files.find((f) => {
    const mime = f.mimetype?.toLowerCase() ?? "";
    return IMAGE_MIMES.has(mime) || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name ?? "");
  });
  if (!image) return undefined;

  let url = image.url_private_download;
  if (!url && image.id) {
    const info = await client.files.info({ file: image.id });
    url = (info.file as SlackInputFile | undefined)?.url_private_download;
  }
  if (!url) throw new Error("Logo file has no private download URL.");

  const token = downloadToken();
  if (!token) throw new Error("SLACK_BOT_TOKEN is required to download logo files.");

  const response = await fetch(assertSlackHost(url), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Logo download failed (${response.status}).`);

  const buf = Buffer.from(await response.arrayBuffer());
  assertAssetSize(buf.length);
  const mime = sniffImageMime(buf) ?? image.mimetype?.toLowerCase();
  assertAllowedAssetMime(mime);

  const dir = path.join(getDataRoot(), "brand-uploads", brandId);
  await mkdir(dir, { recursive: true });
  const filename = `logo${extensionForMime(mime ?? "image/png")}`;
  const dest = path.join(dir, filename);
  await writeFile(dest, buf);
  return dest;
}
