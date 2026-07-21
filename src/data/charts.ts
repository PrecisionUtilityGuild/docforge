export const SUPPORTED_CHART_TYPES = [
  "bar",
  "line",
  "area",
  "pie",
  "donut",
  "waterfall",
  "stacked_bar",
  "kpi_card",
] as const;

export type ChartType = (typeof SUPPORTED_CHART_TYPES)[number];

export type ChartSpec = {
  type: ChartType;
  title?: string;
  data: Array<{ label: string; value: number | string }>;
  options?: Record<string, unknown>;
};

/** Metric row shape shared by kpi_report and monthly_metrics mappers. */
export type MetricRow = {
  name: string;
  value: string;
  unit?: string;
  target?: string;
  trend?: string;
};

const numeric = (v: string) => parseFloat(String(v).replace(/[^0-9.-]/g, "")) || 0;

const unitLabel = (key: string) => {
  if (key === "value") return "";
  return key
    .replace(/percent/gi, "%")
    .replace(/usd/gi, "$")
    .trim();
};

/**
 * Build bar charts grouped by unit so mixed scales (USD vs %) don't flatten bars.
 * Shared by board KPI packs and monthly_metrics CSV ingestion.
 */
export function buildChartsFromMetrics(
  metrics: MetricRow[],
  options?: { maxMetrics?: number },
): ChartSpec[] {
  const max = options?.maxMetrics ?? 24;
  const groups = new Map<string, Array<{ label: string; value: number }>>();
  for (const m of metrics.slice(0, max)) {
    const key = (m.unit || "value").toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ label: m.name, value: numeric(m.value) });
  }

  const titleFor = (key: string) => {
    if (groups.size === 1) return "Metrics Overview";
    const label = unitLabel(key) || key;
    return `Metrics (${label})`;
  };

  return [...groups.entries()].map(([key, data]) => ({
    type: "bar" as const,
    title: titleFor(key),
    data,
    options: unitLabel(key) ? { unit: unitLabel(key) } : {},
  }));
}

export function validateChart(
  chart: unknown,
  index = 0,
): { ok: true; chart: ChartSpec } | { ok: false; message: string; agent_action: string } {
  if (!chart || typeof chart !== "object") {
    return {
      ok: false,
      message: `charts[${index}] must be an object`,
      agent_action: "Provide chart objects with type and data fields.",
    };
  }
  const c = chart as Record<string, unknown>;
  const type = c.type;
  if (typeof type !== "string" || !SUPPORTED_CHART_TYPES.includes(type as ChartType)) {
    return {
      ok: false,
      message: `Unsupported chart type "${String(type)}" at charts[${index}]`,
      agent_action: `Use one of: ${SUPPORTED_CHART_TYPES.join(", ")}`,
    };
  }
  if (!Array.isArray(c.data) || c.data.length === 0) {
    return {
      ok: false,
      message: `charts[${index}].data must be a non-empty array`,
      agent_action: "Add data points with label and value for each chart.",
    };
  }
  return {
    ok: true,
    chart: c as unknown as ChartSpec,
  };
}

export function validateCharts(
  charts: unknown,
): { ok: true } | { ok: false; message: string; agent_action: string } {
  if (charts === undefined) return { ok: true };
  if (!Array.isArray(charts)) {
    return {
      ok: false,
      message: "charts must be an array",
      agent_action: "Provide charts as an array of chart spec objects.",
    };
  }
  for (let i = 0; i < charts.length; i++) {
    const result = validateChart(charts[i], i);
    if (!result.ok) return result;
  }
  return { ok: true };
}
