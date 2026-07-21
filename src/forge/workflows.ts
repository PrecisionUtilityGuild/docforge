export type WorkflowId = "proposal" | "incident" | "board" | "status" | "draft";

export type WorkflowConfig = {
  id: WorkflowId;
  templateId: string;
  label: string;
  triggers: string[];
  exampleCommand: string;
};

export const WORKFLOWS: WorkflowConfig[] = [
  {
    id: "proposal",
    templateId: "sales_proposal",
    label: "Sales proposal",
    triggers: ["proposal for", "proposal", "sow", "quote for"],
    exampleCommand: "@forge proposal for Northstar",
  },
  {
    id: "incident",
    templateId: "incident_report",
    label: "Incident report",
    triggers: ["incident report from", "incident report", "close out incident", "postmortem"],
    exampleCommand: "@forge incident report from #incident-api-gateway",
  },
  {
    id: "board",
    templateId: "kpi_report",
    label: "Board KPI pack",
    triggers: ["board pack", "kpi report", "board update"],
    exampleCommand: "@forge board pack for Q3 operating review",
  },
  {
    id: "status",
    templateId: "project_status",
    label: "Status report",
    triggers: ["status report", "status for", "weekly status", "project status", "status update"],
    exampleCommand: "@forge status for #team-eng",
  },
  {
    id: "draft",
    templateId: "inferred",
    label: "Draft PDF",
    triggers: [
      "turn this into a pdf",
      "turn these notes into a pdf",
      "make a pdf",
      "make pdf",
      "make a one pager",
      "draft",
      "one pager",
      "one-pager",
    ],
    exampleCommand: "@forge draft turn these notes into a PDF",
  },
];

/**
 * Ambiguous single words that only mean "make a document" when phrased as a
 * request. Matching them as bare substrings (a `pdf` / `page` anywhere) misroutes
 * questions like "what page is the error on" into the draft workflow, so they
 * require an imperative lead-in (start of message, or after "make/create/…").
 */
const DRAFT_REQUEST_PATTERNS = [
  /(?:^|\b(?:make|create|generate|build|produce|give me|need|want)\b[\w\s]*?)\bpdf\b/,
  /(?:^|\b(?:make|create|generate|build|produce|give me|need|want)\b[\w\s]*?)\bone[- ]?pager\b/,
];

export function findWorkflowByText(text: string): WorkflowConfig | undefined {
  const normalized = text.toLowerCase();
  const sorted = [...WORKFLOWS].sort(
    (a, b) =>
      Math.max(...b.triggers.map((t) => t.length)) - Math.max(...a.triggers.map((t) => t.length)),
  );
  const direct = sorted.find((workflow) =>
    workflow.triggers.some((trigger) => normalized.includes(trigger)),
  );
  if (direct) return direct;

  // Fall back to the guarded "draft" request patterns for bare "pdf"/"one pager".
  if (DRAFT_REQUEST_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return WORKFLOWS.find((w) => w.id === "draft");
  }
  return undefined;
}
