export type BoardQuality = {
  ok: boolean;
  reason?: string;
  lineCount: number;
  metricNames: string[];
};

export type SlackInputFile = {
  id?: string;
  name?: string;
  title?: string;
  mimetype?: string;
  filetype?: string;
  url_private_download?: string;
};

const MONTHS = new Map(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((month, index) => [month, index + 1]),
);

export function extractFencedCsv(text: string): string | undefined {
  const fenced = text.match(/```(?:csv)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced && looksLikeCsv(fenced)) return fenced;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const start = lines.findIndex((line) => /^metric\s*,\s*value\b/i.test(line));
  if (start === -1) return undefined;
  const csvLines = lines.slice(start).filter((line) => line.includes(","));
  return csvLines.length >= 2 ? csvLines.join("\n") : undefined;
}

export function looksLikeCsv(text: string): boolean {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return false;
  const header = lines[0]!.toLowerCase();
  return header.includes("metric") && header.includes("value") && lines[1]!.includes(",");
}

export function findCsvFile(files: SlackInputFile[] = []): SlackInputFile | undefined {
  return files.find((file) => {
    const name = `${file.name ?? ""} ${file.title ?? ""}`.toLowerCase();
    const type = `${file.mimetype ?? ""} ${file.filetype ?? ""}`.toLowerCase();
    return name.includes(".csv") || type.includes("csv") || type.includes("comma");
  });
}

function normalizePeriod(raw: string, now = new Date()): string {
  const normalized = raw.trim();
  const quarter = normalized.match(/^q([1-4])(?:\s+(\d{4}))?$/i);
  if (quarter) return `${quarter[2] ?? now.getFullYear()}-Q${quarter[1]}`;

  const month = normalized.match(/^([a-z]+)(?:\s+(\d{4}))?$/i);
  if (month) {
    const monthIndex = MONTHS.get(month[1]!.toLowerCase());
    if (monthIndex) {
      return `${month[2] ?? now.getFullYear()}-${String(monthIndex).padStart(2, "0")}`;
    }
  }

  return normalized.toUpperCase();
}

export function parseBoardPeriodHint(text: string, now = new Date()): string | undefined {
  const explicit = text.match(
    /\bfor\s+((?:q[1-4]|[a-z]+)(?:\s+\d{4})?|\d{4}-q[1-4]|\d{4}-\d{2})\b/i,
  )?.[1];
  if (explicit) return normalizePeriod(explicit, now);

  const labelled = text.match(
    /\b(?:period|month|quarter)\s*[:=-]\s*((?:q[1-4]|[a-z]+)(?:\s+\d{4})?|\d{4}-q[1-4]|\d{4}-\d{2})\b/i,
  )?.[1];
  return labelled ? normalizePeriod(labelled, now) : undefined;
}

export function parseBoardPeriod(text: string, now = new Date()): string {
  return parseBoardPeriodHint(text, now) ?? now.toISOString().slice(0, 7);
}

export function boardPdfFilename(period: string): string {
  const safe = period.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `Board-Pack-${safe || "KPI"}.pdf`;
}

export function extractBoardNotes(text: string): string {
  const withoutMention = text.replace(/<@[A-Z0-9]+>/g, "").trim();
  const withoutCsv = withoutMention
    .replace(/```(?:csv)?\s*[\s\S]*?```/i, "")
    .split(/\r?\n/)
    .filter((line) => !line.includes(","))
    .filter(
      (line) =>
        !/^\s*(?:period|month|quarter)\s*[:=-]\s*((?:q[1-4]|[a-z]+)(?:\s+\d{4})?|\d{4}-q[1-4]|\d{4}-\d{2})\s*$/i.test(
          line,
        ),
    )
    .join("\n");
  const cleaned = withoutCsv
    .replace(/\b(?:board pack|kpi report|board update)(?:\s+for\s+[A-Za-z0-9 -]+)?/i, "")
    .trim();
  // Return only genuine user notes. NEVER substitute boilerplate here — the
  // mapper mines this text for board asks, and filler prose like "prepare
  // concise asks for the next meeting" would fabricate an ask the user never made.
  return cleaned;
}

export function assessBoardCsv(csv: string): BoardQuality {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  const header = lines[0]?.split(",").map((cell) => cell.trim().toLowerCase()) ?? [];
  const metricIndex = header.findIndex((cell) => ["metric", "name", "kpi"].includes(cell));
  const valueIndex = header.findIndex((cell) => ["value", "actual"].includes(cell));
  const metricNames = lines
    .slice(1)
    .map((line) => line.split(",")[metricIndex] ?? "")
    .map((name) => name.trim())
    .filter(Boolean);

  if (metricIndex === -1 || valueIndex === -1) {
    return {
      ok: false,
      reason: "CSV needs at least `metric` and `value` columns.",
      lineCount: lines.length,
      metricNames,
    };
  }

  if (metricNames.length === 0) {
    return {
      ok: false,
      reason: "CSV has headers but no KPI rows.",
      lineCount: lines.length,
      metricNames,
    };
  }

  return { ok: true, lineCount: lines.length, metricNames };
}
