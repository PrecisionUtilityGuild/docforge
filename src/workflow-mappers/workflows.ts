import { buildChartsFromMetrics } from "../data/charts.js";
import { stripSlackMarkup } from "../slack/gather/slack-markup.js";
import {
  durationFromTranscriptLines,
  linesToTimeline,
  linesToTranscript,
  type TranscriptLine,
} from "../slack/gather/transcript.js";
import { distillTimeline } from "./incident-timeline.js";
import {
  extractDuration,
  extractRootCause,
  extractServices,
  extractUsersAffected,
  inferActions,
  inferSeverity,
  inferSummary,
  parseTimelineLine,
  type IncidentAction,
} from "./incident-parse.js";

/**
 * incident_report schema requires at least one action. When none were stated in
 * the channel we insert a single, transparent review item that says so — never a
 * fabricated task with a made-up owner/date. The confirm step prompts the human.
 */
function actionsOrPrompt(actions: IncidentAction[]): IncidentAction[] {
  if (actions.length > 0) return actions;
  return [
    {
      title: "Define follow-up actions — none were captured from the channel",
      owner: "Incident lead",
      due: "Confirm before final approval",
      status: "open",
    },
  ];
}

/** CSV + founder notes → KPI board update */
export function csvAndNotesToKpiReport(csv: string, notes: string): Record<string, unknown> {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0]?.split(",").map((h) => h.trim()) ?? [];
  const kpis = lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    const name = row.metric ?? row.name ?? row.kpi ?? cols[0] ?? "Metric";
    const rawValue = row.value ?? row.actual ?? cols[1] ?? "—";
    const rawTarget = row.target ?? cols[2];
    const trend = row.trend ?? "flat";
    // Infer the unit from the column, the value string, or the metric name — so
    // mixed-scale metrics ($ vs %) chart in separate groups and display values
    // are formatted ($4.2M, not 4200000). Inference only reads what the user
    // gave; it never invents a value.
    const unit = inferMetricUnit(row.unit, name, rawValue);
    return {
      name,
      value: formatMetricValue(rawValue, unit),
      unit,
      target: rawTarget ? formatMetricValue(rawTarget, unit) : rawTarget,
      trend,
    };
  });

  const charts = buildChartsFromMetrics(kpis);
  const risks = deriveBoardRisks(kpis);
  const asks = deriveBoardAsks(stripSlackMarkup(notes));
  const trimmedNotes = stripSlackMarkup(notes).trim();
  // Summary is grounded in the data when the user gave no notes — a factual
  // count of how the KPIs landed against target, not boilerplate prose.
  const summary = trimmedNotes ? trimmedNotes.slice(0, 400) : summarizeKpis(kpis, risks);

  return {
    title: "Board KPI Update",
    period: new Date().toISOString().slice(0, 7),
    author: "DocForge Agent",
    summary,
    kpis,
    ...(charts.length > 0 ? { charts } : {}),
    // Commentary echoes the user's notes when present; otherwise the grounded
    // summary, never filler "highlight outperformance…" boilerplate.
    commentary: trimmedNotes || summary,
    // risks/asks are optional in the schema — only include them when grounded in
    // the actual data/notes. We never invent board-level risks or asks.
    ...(risks.length > 0 ? { risks } : {}),
    ...(asks.length > 0 ? { asks } : {}),
  };
}

/** Metric names that denote money — used only to pick a display format, never a value. */
const CURRENCY_NAME =
  /\b(arr|mrr|revenue|rev|sales|bookings|pipeline|cash|burn|spend|cost|budget|gmv|ltv|cac|acv|tcv|payback|opex|capex|ebitda|profit|margin\s*\$|run\s*rate)\b/i;

/**
 * Decide a metric's unit from (in order) an explicit unit column, a suffix in the
 * value string (`112%` → `%`, `$4.2M` → `$`), or the metric name (`ARR` → `$`).
 * Returns "" when nothing indicates a unit (a plain count).
 */
function inferMetricUnit(unitCol: string | undefined, name: string, value: string): string {
  const explicit = (unitCol ?? "").trim();
  if (explicit) {
    if (/percent|%/i.test(explicit)) return "%";
    if (/usd|\$|dollar/i.test(explicit)) return "$";
    return explicit;
  }
  const v = value.trim();
  if (/%\s*$/.test(v) || /\bpct\b|percent/i.test(name)) return "%";
  if (/^\s*[$€£]/.test(v) || CURRENCY_NAME.test(name)) return "$";
  return "";
}

/** Parse the numeric magnitude out of a possibly-formatted value string. */
function metricMagnitude(value: string): number {
  const n = parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/** Compact a large number to a K/M/B suffix with at most one decimal place. */
function abbreviateNumber(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const fmt = (x: number, suffix: string) => {
    const rounded = Math.round(x * 10) / 10;
    const text = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
    return `${sign}${text}${suffix}`;
  };
  if (abs >= 1_000_000_000) return fmt(abs / 1_000_000_000, "B");
  if (abs >= 1_000_000) return fmt(abs / 1_000_000, "M");
  if (abs >= 10_000) return fmt(abs / 1_000, "K");
  return `${sign}${abs.toLocaleString("en-US")}`;
}

/**
 * Format a metric value for display while staying faithful to the user's number.
 *
 * The board guardrail is "never round/restate a number the user gave" — so a
 * value that is already readable (has a symbol, or is a compact figure) passes
 * through untouched. We only reformat the one case that genuinely reads as
 * unfinished: a bare large integer (≥10k) like `2400000`, which becomes `$2.4M`
 * (currency) or `2,400,000` (count). This abbreviation is presentational, not a
 * different number — the magnitude is preserved exactly.
 */
function formatMetricValue(value: string, unit: string): string {
  const raw = String(value).trim();
  if (!raw || raw === "—") return raw;
  // Already carries a symbol/suffix the user typed ($, %, M/K/B, commas) → leave it.
  if (/[$€£%,]|[0-9]\s*[kKmMbB]\b/.test(raw)) return raw;
  const n = metricMagnitude(raw);
  if (Number.isNaN(n)) return raw;
  // Only bare large integers are reformatted; compact figures stay verbatim.
  if (!(Number.isInteger(n) && Math.abs(n) >= 10_000)) return raw;
  return unit === "$" ? `$${abbreviateNumber(n)}` : n.toLocaleString("en-US");
}

/** A factual, data-grounded one-liner: how the KPIs landed against target. */
function summarizeKpis(
  kpis: Array<{ name: string; target?: string }>,
  risks: Array<{ description: string }>,
): string {
  const withTarget = kpis.filter((k) => k.target && k.target.trim()).length;
  const off = risks.length;
  if (withTarget === 0) return `Board KPI update covering ${kpis.length} metric(s).`;
  const onTrack = withTarget - off;
  if (off === 0) {
    return `All ${withTarget} tracked KPIs are at or above target this period.`;
  }
  const names = risks
    .map((r) => r.description.replace(/\s+is\s+(?:above|below) target.*$/i, ""))
    .join(", ");
  return `${onTrack} of ${withTarget} tracked KPIs are on target; ${off} need attention: ${names}.`;
}

/**
 * Metrics where a LOWER number is better — missing target *above* is the risk
 * (churn, cost, payback, latency, error rate…). For everything else higher is
 * better and missing *below* is the risk. This is standard metric semantics, not
 * a guess about the data: we read the KPI name, never invent the direction.
 */
const LOWER_IS_BETTER =
  /\b(churn|attrition|cost|cac|payback|latency|error|errors|downtime|burn|spend|defects?|complaints?|response time|cycle time|time to)\b/i;

/** A KPI that misses its target in the unfavorable direction is a grounded risk. */
function deriveBoardRisks(
  kpis: Array<{ name: string; value: string; target?: string; trend?: string }>,
): Array<{ description: string; severity: string; mitigation: string }> {
  const num = (v?: string) => {
    if (!v) return NaN;
    const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  };
  const risks: Array<{ description: string; severity: string; mitigation: string }> = [];
  for (const kpi of kpis) {
    const value = num(kpi.value);
    const target = num(kpi.target);
    if (Number.isNaN(value) || Number.isNaN(target)) continue;

    const lowerIsBetter = LOWER_IS_BETTER.test(kpi.name);
    const missed = lowerIsBetter ? value > target : value < target;
    if (!missed) continue;

    const gap = ((Math.abs(value - target) / Math.abs(target)) * 100).toFixed(0);
    const relation = lowerIsBetter ? "above target" : "below target";
    risks.push({
      description: `${kpi.name} is ${relation} (${kpi.value} vs ${kpi.target})`,
      severity: Number(gap) >= 15 ? "high" : "medium",
      mitigation: "To be addressed — see commentary",
    });
  }
  return risks.slice(0, 5);
}

/** Extract board asks only from explicit ask/approval language in the notes. */
function deriveBoardAsks(notes: string): Array<{ title: string; owner: string; due: string }> {
  const asks: Array<{ title: string; owner: string; due: string }> = [];
  const seen = new Set<string>();
  for (const raw of notes.split(/\r?\n/)) {
    const line = raw.trim();
    const m = line.match(/\b(?:ask|asks|request|need|approve|approval|decision)\b[:\-\s]+(.+)$/i);
    if (!m) continue;
    const title = m[1].trim().replace(/[.]+$/, "");
    if (title.length < 4) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    asks.push({
      title: title.replace(/^\w/, (c) => c.toUpperCase()),
      owner: "Board",
      due: "Next board review",
    });
  }
  return asks.slice(0, 5);
}

/** Slack gather path — timeline uses real message timestamps, not pasted HH:MM text. */
export function transcriptLinesToIncidentReport(lines: TranscriptLine[]): Record<string, unknown> {
  const transcript = linesToTranscript(lines);
  const rawTimeline = linesToTimeline(lines);
  // Distill the raw 1:1 message stream into the events that materially advanced
  // the incident (detection → diagnosis → mitigation → recovery). The full chat
  // remains in Evidence — timeline is the narrative, evidence is the audit trail.
  const timeline = distillTimeline(rawTimeline);
  const services = extractServices(transcript);
  const timelineStrings = timeline.map((entry) => `${entry.time} ${entry.event}`);

  return {
    title: "Production Incident Report",
    incident_id: `INC-${Date.now().toString(36).toUpperCase()}`,
    severity: inferSeverity(transcript),
    date: new Date().toISOString().slice(0, 10),
    summary: inferSummary(transcript, rawTimeline),
    timeline,
    impact: {
      users_affected: extractUsersAffected(transcript) ?? "See incident channel discussion",
      duration:
        extractDuration(transcript, timelineStrings) ??
        durationFromTranscriptLines(lines) ??
        "Unknown",
      services: services.length > 0 ? services : ["Production API"],
    },
    root_cause:
      extractRootCause(transcript) ??
      "Under investigation — see incident channel for latest updates.",
    actions: actionsOrPrompt(inferActions(transcript)),
    evidence: transcript + sourceCitations(lines),
  };
}

/**
 * Build a "Sources" footer from lines that carry a Slack permalink (RTS results),
 * so the report cites the real messages it was assembled from — verifiable
 * provenance, not a black box.
 */
function sourceCitations(lines: TranscriptLine[]): string {
  const cited = lines.filter((l) => l.permalink);
  if (cited.length === 0) return "";
  const seen = new Set<string>();
  const items = cited
    .filter((l) => {
      const key = l.permalink!;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8)
    .map((l) => {
      const where = l.channel ? `#${l.channel}` : l.speaker;
      return `- ${where}: ${l.permalink}`;
    });
  return `\n\nSources (via Slack Real-Time Search):\n${items.join("\n")}`;
}

/** Plain-text transcript from workflow tests or production threads; may include embedded HH:MM lines. */
export function transcriptToIncidentReport(transcript: string): Record<string, unknown> {
  const lines = transcript.split(/\r?\n/).filter(Boolean);
  const rawTimeline = lines.map((line, index) => parseTimelineLine(line, index));
  const timeline = distillTimeline(rawTimeline);
  const services = extractServices(transcript);

  return {
    title: "Production Incident Report",
    incident_id: `INC-${Date.now().toString(36).toUpperCase()}`,
    severity: inferSeverity(transcript),
    date: new Date().toISOString().slice(0, 10),
    // Summary reads the RAW timeline so it can find the true opening event even
    // if distillation reframed it.
    summary: inferSummary(transcript, rawTimeline),
    timeline,
    impact: {
      users_affected: extractUsersAffected(transcript) ?? "See incident channel discussion",
      duration: extractDuration(transcript, lines),
      services: services.length > 0 ? services : ["Production API"],
    },
    root_cause:
      extractRootCause(transcript) ??
      "Under investigation — root cause not fully confirmed in channel transcript.",
    actions: actionsOrPrompt(inferActions(transcript)),
    evidence: transcript.slice(0, 2000),
  };
}

/** Discovery call notes → sales proposal */
/**
 * Map discovery transcript + user-supplied requirements + user-supplied pricing
 * to a sales_proposal record.
 *
 * Integrity rules (no fabrication):
 *  - Client name is extracted from the transcript; we never bake in a fixed
 *    client or invent a contact/email — those fields are omitted unless
 *    actually found in the discovery.
 *  - Pricing total === sum of the user's line items. No silent markup/uplift.
 *  - Executive summary is grounded in the actual scope items, not a canned line.
 *  - Timeline phases are an explicitly generic engagement scaffold the user edits
 *    before approval — no invented per-phase durations claimed as the client's.
 */
export function discoveryToSalesProposal(
  transcript: string,
  requirements: string,
  pricingRows: Array<{ item: string; amount: string; notes?: string }>,
): Record<string, unknown> {
  const subtotal = pricingRows.reduce((sum, row) => {
    const n = parseFloat(row.amount.replace(/[^0-9.]/g, ""));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const money = `$${subtotal.toLocaleString()}`;

  const scope = requirements
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((item) => ({ item }));

  const clientName = extractClientName(transcript) ?? "Prospective Client";
  const contact = extractClientContact(transcript);

  const scopeWords = scope
    .slice(0, 3)
    .map((s) => s.item.replace(/[.]+$/, "").toLowerCase())
    .join(", ");

  return {
    title: "Professional Services Proposal",
    client: {
      name: clientName,
      ...(contact?.contact ? { contact: contact.contact } : {}),
      ...(contact?.email ? { email: contact.email } : {}),
    },
    date: new Date().toISOString().slice(0, 10),
    executive_summary: scopeWords
      ? `Proposal for ${clientName} covering ${scopeWords}, delivered through a phased engagement with explicit scope, timeline, and pricing.`
      : `Proposal for ${clientName} based on the discovery captured in this engagement.`,
    scope,
    timeline: [
      {
        phase: "Discovery & design",
        duration: "Confirm during kickoff",
        deliverables: "Confirm scope and plan",
      },
      {
        phase: "Implementation",
        duration: "Defined by signed SOW",
        deliverables: "Agreed scope items",
      },
      {
        phase: "Rollout & enablement",
        duration: "Scheduled during kickoff",
        deliverables: "Training and handoff",
      },
    ],
    pricing: {
      line_items: pricingRows,
      subtotal: money,
      // No markup — the total is exactly what the client priced.
      total: money,
      terms: "Net 30; payment schedule to be agreed in the SOW",
    },
    assumptions: [
      "Scope changes require a written change order",
      "Durations and payment schedule to be finalized with the client",
    ],
    next_steps: ["Review proposal with stakeholders", "Agree scope and sign the SOW"],
    discovery_notes: transcript.slice(0, 1500),
  };
}

/** Best-effort client name from discovery text; undefined if not clearly stated. */
function extractClientName(transcript: string): string | undefined {
  const patterns = [
    /\bfor\s+([A-Z][A-Za-z0-9&. -]{1,40}?)(?:\s+(?:wants|needs|is looking|requires|seeks|asked)\b|[.,\n])/,
    /\b([A-Z][A-Za-z0-9&.-]{1,30})\s+(?:wants|needs|is looking for|requires|seeks)\b/,
  ];
  for (const p of patterns) {
    const m = transcript.match(p);
    const name = m?.[1]?.trim();
    if (name && name.length >= 2 && !/^(the|we|they|our|client)$/i.test(name)) return name;
  }
  return undefined;
}

/** Extract a contact name/email only if genuinely present — never invented. */
function extractClientContact(
  transcript: string,
): { contact?: string; email?: string } | undefined {
  const email = transcript.match(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i)?.[0];
  const contact = transcript.match(/\bcontact[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/)?.[1];
  if (!email && !contact) return undefined;
  return { ...(contact ? { contact } : {}), ...(email ? { email } : {}) };
}
