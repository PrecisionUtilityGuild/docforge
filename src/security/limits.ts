// Limits are read lazily from the environment at call time, not frozen at
// import — so DOCFORGE_MAX_*_BYTES set by the runtime (or tests) actually applies.
function envBytes(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function maxDocumentDataBytes(): number {
  return envBytes("DOCFORGE_MAX_DATA_BYTES", 5 * 1024 * 1024);
}
export function maxCsvAttachmentBytes(): number {
  return envBytes("DOCFORGE_MAX_CSV_BYTES", 1024 * 1024);
}
export function maxAssetBytes(): number {
  return envBytes("DOCFORGE_MAX_ASSET_BYTES", 10 * 1024 * 1024);
}

const ALLOWED_ASSET_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

export function assertDataSize(data: unknown, label = "data"): void {
  const max = maxDocumentDataBytes();
  const bytes = Buffer.byteLength(JSON.stringify(data), "utf8");
  if (bytes > max) {
    throw new Error(`${label} exceeds maximum size (${max} bytes). Reduce payload and retry.`);
  }
}

export function assertCsvSize(csv: string): void {
  const max = maxCsvAttachmentBytes();
  const bytes = Buffer.byteLength(csv, "utf8");
  if (bytes > max) {
    throw new Error(`csv_attachment exceeds maximum size (${max} bytes).`);
  }
}

export function assertAssetSize(bytes: number): void {
  const max = maxAssetBytes();
  if (bytes > max) {
    throw new Error(`Asset exceeds maximum size (${max} bytes).`);
  }
}

/** Basic MIME sniff from magic bytes — not exhaustive but blocks obvious non-images. */
export function sniffImageMime(buf: Buffer): string | undefined {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x49) return "image/gif";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF") return "image/webp";
  if (buf.length >= 5 && buf.toString("utf8", 0, 5).toLowerCase().includes("<svg")) {
    return "image/svg+xml";
  }
  return undefined;
}

export function assertAllowedAssetMime(mime: string | undefined): void {
  if (!mime || !ALLOWED_ASSET_MIMES.has(mime)) {
    throw new Error("Asset MIME type not allowed. Use PNG, JPEG, WebP, GIF, or SVG.");
  }
}
