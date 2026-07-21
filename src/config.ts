import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PACKAGE_ROOT = path.resolve(__dirname, "..");
export const TEMPLATES_ROOT = path.join(PACKAGE_ROOT, "templates");
export const MARKETPLACE_ROOT = path.join(PACKAGE_ROOT, "marketplace");
export const BRAND_KITS_ROOT = path.join(PACKAGE_ROOT, "brand_kits");
export const DOCFORGE_PACKAGES_ROOT = path.join(PACKAGE_ROOT, "packages", "docforge");
export function getDataRoot(): string {
  return process.env.DOCFORGE_DATA_ROOT ?? path.join(PACKAGE_ROOT, ".data", "documents");
}

export const TYPST_BIN = process.env.DOCFORGE_TYPST_PATH ?? "typst";
export const TYPST_VERSION_PIN = "0.14.2";

/**
 * Vendored, offline Typst package store (read-first, no network). Compilation
 * passes this as `--package-path` so `@preview/*` imports resolve from the repo
 * instead of the network — required for locked-down containers. Override with
 * DOCFORGE_TYPST_PACKAGE_PATH.
 */
export const VENDORED_PACKAGE_PATH =
  process.env.DOCFORGE_TYPST_PACKAGE_PATH ?? path.join(PACKAGE_ROOT, "vendor", "typst-packages");
export const COMPILE_TIMEOUT_MS = Number(process.env.DOCFORGE_COMPILE_TIMEOUT_MS ?? 30_000);
export const DOCUMENT_TTL_MS = Number(process.env.DOCFORGE_DOCUMENT_TTL_MS ?? 86_400_000);
