import { readFile } from "node:fs/promises";
import path from "node:path";
import { meetsWcagAaText } from "./contrast.js";
import type { BrandKit } from "./types.js";

function hexFromRgb(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function ensureWcagSafeColors(colors: BrandKit["colors"]): BrandKit["colors"] {
  const background = colors.background;
  let text = colors.text;
  let primary = colors.primary;
  if (!meetsWcagAaText(text, background)) text = "#1A1A1A";
  if (!meetsWcagAaText(primary, background)) primary = "#111111";
  return { ...colors, text, primary };
}

async function sampleLogoColors(logoPath: string): Promise<{ primary: string; accent: string }> {
  const buf = await readFile(logoPath);
  const samples: Array<[number, number, number]> = [];
  const stride = Math.max(1, Math.floor(buf.length / 500));
  for (let i = 0; i < buf.length - 3; i += stride) {
    const r = buf[i]!;
    const g = buf[i + 1]!;
    const b = buf[i + 2]!;
    if (r + g + b > 40 && r + g + b < 720) samples.push([r, g, b]);
  }
  if (!samples.length) {
    return { primary: "#111111", accent: "#2563eb" };
  }
  const avg = samples.reduce((acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b], [0, 0, 0]);
  const n = samples.length;
  const primary = hexFromRgb(
    Math.round(avg[0]! / n),
    Math.round(avg[1]! / n),
    Math.round(avg[2]! / n),
  );
  const accent = hexFromRgb(
    Math.min(255, Math.round(avg[0]! / n) + 40),
    Math.min(255, Math.round(avg[1]! / n) + 20),
    Math.max(0, Math.round(avg[2]! / n) - 20),
  );
  return { primary, accent };
}

export async function extractBrandKit(input: {
  id: string;
  name: string;
  logo_path?: string;
  colors?: { primary?: string; accent?: string; muted?: string };
  footer?: string;
}): Promise<{ ok: true; kit: BrandKit } | { ok: false; message: string }> {
  let primary = input.colors?.primary ?? "#111111";
  let accent = input.colors?.accent ?? "#2563eb";

  if (input.logo_path) {
    try {
      const sampled = await sampleLogoColors(input.logo_path);
      if (!input.colors?.primary) primary = sampled.primary;
      if (!input.colors?.accent) accent = sampled.accent;
    } catch {
      return {
        ok: false,
        message: "Could not read logo file. Provide a valid image path under allowed directories.",
      };
    }
  }

  const kit: BrandKit = {
    id: input.id,
    name: input.name,
    logo: input.logo_path ? path.basename(input.logo_path) : undefined,
    logo_alt: input.logo_path ? `${input.name} logo` : undefined,
    colors: ensureWcagSafeColors({
      primary,
      accent,
      muted: input.colors?.muted ?? "#64748b",
      background: "#FFFFFF",
      text: "#1A1A1A",
    }),
    fonts: {
      heading: "Libertinus Serif",
      body: "Libertinus Serif",
      mono: "DejaVu Sans Mono",
    },
    footer: input.footer ?? `Confidential — ${input.name}`,
    tone: "extracted",
  };

  return { ok: true, kit };
}
