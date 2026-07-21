#!/usr/bin/env node
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = await mkdtemp(path.join(tmpdir(), "forge-smoke-"));
process.env.DOCFORGE_DATA_ROOT = dataRoot;

const {
  csvAndNotesToKpiReport,
  discoveryToSalesProposal,
  transcriptLinesToProjectStatus,
  transcriptToIncidentReport,
} = await import(path.join(ROOT, "dist/service.js"));
const { producePdf } = await import(path.join(ROOT, "dist/forge/pipeline.js"));
const { inferDraftDocument } = await import(
  path.join(ROOT, "dist/slack/workflows/draft-inference.js")
);

const workflows = [
  {
    name: "kpi_report",
    templateId: "kpi_report",
    data: () =>
      csvAndNotesToKpiReport(
        `metric,value,target,trend
ARR,4200000,4000000,up
NRR,112%,110%,up
Churn,2.1%,3%,down`,
        "Founder notes: Enterprise pipeline up 34%. Need board approval for partner program budget. Automation beta on track for July.",
      ),
  },
  {
    name: "incident_report",
    templateId: "incident_report",
    data: () =>
      transcriptToIncidentReport(`14:02 Pager: api-gateway error rate 5.2%
14:08 @sre: opening incident bridge
14:18 Root cause likely connection pool after cache flush
14:35 Rollback deployed, errors dropping
14:49 All clear — critical path restored`),
  },
  {
    name: "sales_proposal",
    templateId: "sales_proposal",
    data: () =>
      discoveryToSalesProposal(
        "Client wants ERP integration, KPI dashboards, and admin training. Timeline target is 10 weeks. Budget discussed around $120k.",
        `Inventory sync with analytics warehouse
Custom KPI templates for ops leadership
Training for internal BI team`,
        [
          { item: "Solution engineering", amount: "$96000" },
          { item: "Project management", amount: "$12000" },
          { item: "Training", amount: "$8000" },
        ],
      ),
  },
  {
    name: "project_status",
    templateId: "project_status",
    data: () =>
      transcriptLinesToProjectStatus(
        [
          {
            ts: "1718604000.0001",
            speaker: "team",
            text: "API gateway integration is delayed — waiting on partner sandbox certification.",
          },
          {
            ts: "1718607600.0001",
            speaker: "team",
            text: "Dashboard analytics shipped and the new CI pipeline is on track for prod next week.",
          },
          {
            ts: "1718611200.0001",
            speaker: "team",
            text: "Next steps: run the gateway cutover dry run on June 17.",
          },
        ],
        { period: "Week of 2026-06-15", channelLabel: "#team-eng" },
      ),
  },
  {
    name: "draft_pdf",
    templateId: "executive_memo",
    data: () =>
      inferDraftDocument(
        "Weekly update: pipeline improved, onboarding risk remains, recommendation is to add a guided setup wizard.",
        new Date("2026-06-15T12:00:00Z"),
        "executive_memo",
      ).draftData,
  },
];

let failed = false;

for (const workflow of workflows) {
  try {
    const { documentId, pdfPath, receipt, receiptPath } = await producePdf(
      workflow.templateId,
      workflow.data(),
      {
        workflow:
          workflow.name === "kpi_report"
            ? "board"
            : workflow.name === "sales_proposal"
              ? "proposal"
              : workflow.name === "project_status"
                ? "status"
                : workflow.name === "incident_report"
                  ? "incident"
                  : "draft",
        gather: { source_labels: ["forge-smoke"], source_count: 1, gather_method: "headless" },
      },
    );
    const info = await stat(pdfPath);
    const receiptInfo = await stat(receiptPath);
    if (info.size === 0) {
      throw new Error("PDF file is empty");
    }
    if (receiptInfo.size === 0) {
      throw new Error("Receipt file is empty");
    }
    console.log(
      `OK ${workflow.name}: ${pdfPath} (${info.size} bytes, build #${receipt.build_id}, document ${documentId})`,
    );
  } catch (err) {
    failed = true;
    console.error(`FAIL ${workflow.name}:`, err instanceof Error ? err.message : err);
  }
}

await rm(dataRoot, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
