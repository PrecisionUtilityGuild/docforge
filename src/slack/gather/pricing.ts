import { stripBotMention } from "../router.js";

export type PricingRow = { item: string; amount: string; notes?: string };

export function normalizePricingInput(text: string): string {
  return stripBotMention(text)
    .replace(/\u00a0/g, " ")
    .replace(/[–—‒]/g, " - ");
}

const ROW_WITH_SEP = /^[-•*]?\s*(.+?)\s*(?:—|--|-|–|:)\s*(\$?[\d,]+(?:\.\d{2})?)\s*$/;
const ROW_WITH_SPACE = /^[-•*]?\s*(.+?)\s+(\$[\d,]+(?:\.\d{2})?|\d{3,}(?:,\d{3})*(?:\.\d{2})?)\s*$/;

function normalizeAmount(raw: string): string | undefined {
  const amount = raw.trim();
  const hasCurrency = amount.startsWith("$");
  const digits = amount.replace(/\D/g, "");
  if (!hasCurrency && digits.length < 3) return undefined;
  return hasCurrency ? amount : `$${amount}`;
}

function parsePricingLine(trimmed: string): PricingRow | undefined {
  const withSep = trimmed.match(ROW_WITH_SEP);
  if (withSep) {
    const amount = normalizeAmount(withSep[2]);
    if (!amount) return undefined;
    return { item: withSep[1].trim(), amount };
  }
  const withSpace = trimmed.match(ROW_WITH_SPACE);
  if (withSpace) {
    const amount = normalizeAmount(withSpace[2]);
    if (!amount) return undefined;
    return { item: withSpace[1].trim(), amount };
  }
  return undefined;
}

export function parsePricingLines(text: string): PricingRow[] {
  const rows: PricingRow[] = [];
  for (const line of normalizePricingInput(text).split(/\r?\n/)) {
    let trimmed = line.trim();
    if (!trimmed) continue;
    trimmed = trimmed.replace(/^<@[A-Z0-9]+>\s*/i, "").trim();
    if (!trimmed || !/\d/.test(trimmed)) continue;

    const row = parsePricingLine(trimmed);
    if (row) rows.push(row);
  }
  return rows;
}

export function pricingSubtotal(rows: PricingRow[]): number {
  return rows.reduce((sum, row) => {
    const n = parseFloat(row.amount.replace(/[^0-9.]/g, ""));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}
