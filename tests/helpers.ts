import path from "node:path";
import { MARKETPLACE_ROOT, PACKAGE_ROOT } from "../src/config.js";

export const TEMPLATE_IDS = [
  "technical_note",
  "executive_memo",
  "sales_proposal",
  "research_report",
  "incident_report",
  "kpi_report",
  "monthly_metrics",
  "survey_report",
  "financial_snapshot",
  "postmortem",
  "project_status",
  "decision_record",
  "meeting_brief",
  "invoice",
  "contract_summary",
  "cv",
  "client_intake",
  "risk_assessment",
  "cohort_analysis",
  "board_one_pager",
  "compliance_memo",
] as const;

export const MARKETPLACE_TEMPLATE_IDS = ["startup_pitch", "nonprofit_report", "tech_rfc"] as const;

export const ALL_TEMPLATE_IDS = [...TEMPLATE_IDS, ...MARKETPLACE_TEMPLATE_IDS] as const;

export const WAVE6_OPS_TEMPLATES = [
  "postmortem",
  "project_status",
  "decision_record",
  "meeting_brief",
] as const;

export const WAVE6_PRO_TEMPLATES = ["invoice", "contract_summary"] as const;

export function marketplaceDir(id: (typeof MARKETPLACE_TEMPLATE_IDS)[number]): string {
  return path.join(MARKETPLACE_ROOT, id);
}

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export function templateDir(id: TemplateId): string {
  return path.join(PACKAGE_ROOT, "templates", id);
}
