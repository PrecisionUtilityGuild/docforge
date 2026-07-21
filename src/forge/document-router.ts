import { csvToMonthlyMetricsData, parseCsv } from "../data/csv.js";
import { normalizeWorkflowSource } from "./source-text.js";
import { parseExplicitTemplateId } from "../templates/studio.js";
import { getTemplate, listTemplates } from "../templates/registry.js";
import { buildDraftFromCustomTemplate } from "../templates/studio.js";
import { inferDraftDocument, type DraftInference } from "../workflow-mappers/draft.js";
import { csvAndNotesToKpiReport } from "../workflow-mappers/workflows.js";
import { markTitleDraft } from "../slack/confirm/draft.js";

export type DocumentRouterInput = {
  sourceText: string;
  commandText?: string;
  explicitTemplateId?: string;
  csv?: string;
  period?: string;
  commentary?: string;
};

export type DocumentRouterResult = DraftInference & {
  routedBy: "explicit" | "csv" | "inference";
};

const CSV_FENCE = /```(?:csv)?\s*([\s\S]*?)```/i;
const CSV_HEADER = /^(metric|name|kpi),/im;

function extractCsv(text: string): string | undefined {
  const fenced = text.match(CSV_FENCE);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  const lines = text.trim().split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => CSV_HEADER.test(l.trim()));
  if (headerIdx >= 0 && lines.length > headerIdx + 1) {
    return lines.slice(headerIdx).join("\n");
  }
  return undefined;
}

function looksLikeBoardPack(text: string): boolean {
  return /\b(board|kpi|operating review|quarterly)\b/i.test(text);
}

function periodPdfSuffix(period?: string): string {
  return period?.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") ?? "";
}

function monthlyMetricsFilename(period?: string): string {
  const suffix = periodPdfSuffix(period);
  return `Monthly-Metrics${suffix ? `-${suffix}` : ""}.pdf`;
}

async function resolveExplicitTemplate(
  templateId: string,
  sourceText: string,
): Promise<DocumentRouterResult> {
  await getTemplate(templateId);
  const built = await buildDraftFromCustomTemplate(templateId, sourceText);
  return {
    templateId: built.templateId,
    templateLabel: built.templateLabel,
    confidence: "explicit",
    signals: ["explicit template"],
    draftData: built.draftData,
    filename: built.filename,
    preview: sourceText.split(/\r?\n/).filter(Boolean).slice(0, 5),
    candidates: [],
    ambiguous: false,
    routedBy: "explicit",
  };
}

function routeCsv(
  csv: string,
  sourceText: string,
  notes: string,
  options: { explicitTemplateId?: string; period?: string; commentary?: string } = {},
): DocumentRouterResult {
  const useKpi = looksLikeBoardPack(sourceText) || looksLikeBoardPack(notes);
  if (options.explicitTemplateId === "kpi_report" || (!options.explicitTemplateId && useKpi)) {
    const draftData = markTitleDraft(csvAndNotesToKpiReport(csv, notes));
    return {
      templateId: "kpi_report",
      templateLabel: "KPI report",
      confidence: "high",
      signals: ["CSV metrics table", "board/kpi context"],
      draftData,
      filename: "Board-KPI-Pack.pdf",
      preview: parseCsv(csv)
        .rows.slice(0, 4)
        .map((r) => r.join(", ")),
      candidates: [],
      ambiguous: false,
      routedBy: "csv",
    };
  }

  const draftData = markTitleDraft(
    csvToMonthlyMetricsData(csv, {
      period: options.period,
      commentary: options.commentary || notes,
    }),
  );
  return {
    templateId: "monthly_metrics",
    templateLabel: "Monthly metrics",
    confidence: "high",
    signals: ["CSV metrics table"],
    draftData,
    filename: monthlyMetricsFilename(options.period),
    preview: parseCsv(csv)
      .rows.slice(0, 4)
      .map((r) => r.join(", ")),
    candidates: [],
    ambiguous: false,
    routedBy: "csv",
  };
}

type TemplateScore = { templateId: string; points: number; signals: string[] };

/** Score all registered templates against source signals for full-catalog routing. */
async function scoreCatalog(text: string): Promise<TemplateScore[]> {
  const lower = text.toLowerCase();
  const templates = await listTemplates();
  const scores: TemplateScore[] = templates.map((t) => ({
    templateId: t.id,
    points: 0,
    signals: [],
  }));
  const bump = (id: string, pts: number, signal: string) => {
    const s = scores.find((x) => x.templateId === id);
    if (!s) return;
    s.points += pts;
    s.signals.push(signal);
  };

  if (CSV_HEADER.test(text)) {
    bump("monthly_metrics", 6, "inline CSV");
    bump("kpi_report", 4, "inline CSV");
    bump("financial_snapshot", 2, "inline CSV");
  }
  if (/\$\$[\s\S]+?\$\$|\\\[/.test(text)) {
    bump("technical_note", 5, "equations");
    bump("research_report", 4, "equations");
  }
  if (/\b(abstract|finding|hypothesis|method|citation|research)\b/.test(lower)) {
    bump("research_report", 3, "research language");
  }
  if (/\b(agenda|attendees?|meeting|standup|sync)\b/.test(lower)) {
    bump("meeting_brief", 4, "meeting language");
  }
  if (/\b(decision|adr|alternative|trade[- ]?off|consequence)\b/.test(lower)) {
    bump("decision_record", 4, "decision language");
  }
  if (/\b(revenue|profit|margin|ebitda|balance sheet|cash flow)\b/.test(lower)) {
    bump("financial_snapshot", 5, "financial language");
  }
  if (/\b(survey|nps|csat|respondent)\b/.test(lower)) {
    bump("survey_report", 4, "survey language");
  }
  if (/\b(cohort|retention curve|churn cohort)\b/.test(lower)) {
    bump("cohort_analysis", 4, "cohort language");
  }
  if (/\b(risk|mitigation|likelihood|impact matrix)\b/.test(lower)) {
    bump("risk_assessment", 3, "risk language");
  }
  if (/\b(compliance|regulatory|audit|gdpr|sox)\b/.test(lower)) {
    bump("compliance_memo", 3, "compliance language");
  }
  if (/\b(invoice|line items?|payment due)\b/.test(lower)) {
    bump("invoice", 3, "invoice language");
  }
  if (/\b(cv|resume|experience|employment)\b/.test(lower)) {
    bump("cv", 3, "CV language");
  }

  bump("executive_memo", 1, "fallback memo");
  return scores.sort((a, b) => b.points - a.points);
}

/**
 * Single entry: normalized source in → template + schema-shaped draft out.
 * Used by @forge draft / @forge make and explicit @forge document escape hatch.
 */
export async function routeDocument(input: DocumentRouterInput): Promise<DocumentRouterResult> {
  const explicitId =
    input.explicitTemplateId ??
    (input.commandText ? parseExplicitTemplateId(input.commandText) : undefined);

  const normalized = normalizeWorkflowSource(input.sourceText, {
    explicitTemplateId: explicitId,
  });

  const csv = input.csv ?? extractCsv(normalized);
  if (csv && parseCsv(csv).rows.length > 0) {
    const notes = normalized.replace(CSV_FENCE, "").trim();
    if (!explicitId || explicitId === "monthly_metrics" || explicitId === "kpi_report") {
      return routeCsv(csv, input.commandText ?? input.sourceText, notes, {
        explicitTemplateId: explicitId,
        period: input.period,
        commentary: input.commentary,
      });
    }
  }

  if (explicitId) {
    return resolveExplicitTemplate(explicitId, input.sourceText);
  }

  const inference = inferDraftDocument(normalized);
  const catalog = await scoreCatalog(normalized);
  const catalogWinner = catalog[0];
  const proseTemplates = new Set([
    "technical_note",
    "executive_memo",
    "research_report",
    "meeting_brief",
    "decision_record",
  ]);

  if (catalogWinner && catalogWinner.points >= 5 && !proseTemplates.has(catalogWinner.templateId)) {
    const { meta } = await getTemplate(catalogWinner.templateId);
    const built = await buildDraftFromCustomTemplate(catalogWinner.templateId, normalized);
    return {
      templateId: built.templateId,
      templateLabel: meta.name,
      confidence: "medium",
      signals: catalogWinner.signals,
      draftData: built.draftData,
      filename: built.filename,
      preview: inference.preview,
      candidates: [],
      ambiguous: false,
      routedBy: "inference",
    };
  }

  return { ...inference, routedBy: "inference" };
}

/** List templates grouped by source for @forge template list. */
export async function listTemplatesBySource(): Promise<{
  builtin: Awaited<ReturnType<typeof listTemplates>>;
  marketplace: Awaited<ReturnType<typeof listTemplates>>;
  custom: Awaited<ReturnType<typeof listTemplates>>;
}> {
  const all = await listTemplates();
  return {
    builtin: all.filter((t) => t.category === "builtin" || !t.category),
    marketplace: all.filter((t) => t.category === "marketplace"),
    custom: all.filter((t) => t.category === "custom"),
  };
}
