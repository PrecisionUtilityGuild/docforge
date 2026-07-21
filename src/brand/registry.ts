import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BRAND_KITS_ROOT, getDataRoot } from "../config.js";
import { meetsWcagAaText } from "./contrast.js";
import type { BrandKit } from "./types.js";
import { APPROVED_FONTS } from "./types.js";

export type BrandValidationResult =
  | { ok: true; kit: BrandKit }
  | { ok: false; errors: string[]; agent_action: string };

function dataBrandKitDir(brandId: string): string {
  return path.join(getDataRoot(), "brand-kits", brandId);
}

/** Package-shipped kits (northstar, default) plus extracted kits under DOCFORGE_DATA_ROOT. */
export function getBrandKitDir(brandId: string): string {
  const extracted = dataBrandKitDir(brandId);
  if (existsSync(path.join(extracted, "brand.json"))) return extracted;
  return path.join(BRAND_KITS_ROOT, brandId);
}

export async function getBrandKit(brandId: string): Promise<BrandKit> {
  const candidates = [dataBrandKitDir(brandId), path.join(BRAND_KITS_ROOT, brandId)];
  for (const dir of candidates) {
    const brandPath = path.join(dir, "brand.json");
    try {
      const raw = await readFile(brandPath, "utf8");
      const kit = JSON.parse(raw) as BrandKit;
      if (kit.id !== brandId) {
        throw new Error(`Brand kit id mismatch: expected ${brandId}, got ${kit.id}`);
      }
      return kit;
    } catch (err) {
      if (err instanceof Error && err.message.includes("id mismatch")) throw err;
    }
  }
  throw new Error(`Brand kit not found: ${brandId}`);
}

export function validateBrandKit(kit: BrandKit): BrandValidationResult {
  const errors: string[] = [];

  if (kit.logo && !kit.logo_alt?.trim()) {
    errors.push("Brand kit with logo requires logo_alt for accessibility.");
  }

  const { text, background, primary } = kit.colors;
  if (!meetsWcagAaText(text, background)) {
    errors.push(`Text/background contrast ${text} on ${background} fails WCAG AA (needs ≥4.5:1).`);
  }
  if (!meetsWcagAaText(primary, background)) {
    errors.push(
      `Primary/background contrast ${primary} on ${background} fails WCAG AA (needs ≥4.5:1).`,
    );
  }

  for (const font of [kit.fonts.body, kit.fonts.heading, kit.fonts.mono].filter(Boolean)) {
    if (font && !APPROVED_FONTS.includes(font as (typeof APPROVED_FONTS)[number])) {
      errors.push(`Font "${font}" is not in the Wave 3 approved list.`);
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      agent_action:
        "Fix brand kit colors for WCAG AA contrast (≥4.5:1), add logo_alt when logo is set, and use approved fonts.",
    };
  }

  return { ok: true, kit };
}

export async function loadAndValidateBrand(brandId: string): Promise<BrandValidationResult> {
  try {
    const kit = await getBrandKit(brandId);
    return validateBrandKit(kit);
  } catch {
    return {
      ok: false,
      errors: [`Unknown brand_id: ${brandId}`],
      agent_action: "Use a valid brand_id from brand_kits/ (e.g. default, northstar).",
    };
  }
}
