import { buildChartsFromMetrics } from "./charts.js";

/** Minimal RFC4180-ish CSV parser for agent-supplied metrics tables. */
export function parseCsv(csv: string): { headers: string[]; rows: string[][] } {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

export type MonthlyMetricsCsvOptions = {
  title?: string;
  period?: string;
  commentary?: string;
};

export function csvToMonthlyMetricsData(
  csv: string,
  optionsOrTitle?: MonthlyMetricsCsvOptions | string,
): Record<string, unknown> {
  const options =
    typeof optionsOrTitle === "string" ? { title: optionsOrTitle } : (optionsOrTitle ?? {});
  const { headers, rows } = parseCsv(csv);
  const metrics = rows.map((cols) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return {
      name: row.metric ?? row.name ?? cols[0] ?? "Metric",
      value: row.value ?? row.actual ?? cols[1] ?? "—",
      unit: row.unit ?? "",
      target: row.target,
      trend: row.trend ?? "flat",
    };
  });

  const charts = buildChartsFromMetrics(metrics);

  return {
    title: options.title ?? "Monthly Metrics Report",
    period: options.period ?? new Date().toISOString().slice(0, 7),
    summary: `Automated report from CSV with ${metrics.length} metrics.`,
    metrics,
    charts,
    commentary:
      options.commentary || "Generated from uploaded CSV data via DocForge CSV ingestion.",
  };
}
