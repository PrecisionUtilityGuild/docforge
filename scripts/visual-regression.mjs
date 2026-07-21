#!/usr/bin/env node
/**
 * Visual regression: compile each template sample and compare page-1 preview
 * against committed golden PNG (templates/{id}/golden-page1.png).
 * Fails CI if pixel diff exceeds threshold.
 */
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileDocumentWorkspace } from "../dist/compile/typst.js";
import { createDocumentWorkspace, writeDocumentData } from "../dist/sandbox/workspace.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILTIN_TEMPLATES = [
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
];

const MARKETPLACE_TEMPLATES = ["startup_pitch", "nonprofit_report", "tech_rfc"];

const TEMPLATE_SOURCES = [
  ...BUILTIN_TEMPLATES.map((id) => ({ id, root: path.join(PACKAGE_ROOT, "templates") })),
  ...MARKETPLACE_TEMPLATES.map((id) => ({ id, root: path.join(PACKAGE_ROOT, "marketplace") })),
];

const PIXEL_DIFF_THRESHOLD = Number(process.env.DOCFORGE_VISUAL_THRESHOLD ?? 0.02);

function bufferDiffRatio(a, b) {
  const len = Math.max(a.length, b.length);
  if (len === 0) return 0;
  let diff = Math.abs(a.length - b.length);
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) diff++;
  }
  return diff / len;
}

async function main() {
  const outRoot = path.join(PACKAGE_ROOT, ".visual-regression");
  await mkdir(outRoot, { recursive: true });

  let failed = false;

  for (const { id: templateId, root } of TEMPLATE_SOURCES) {
    const templateDir = path.join(root, templateId);
    const goldenPath = path.join(templateDir, "golden-page1.png");
    const sample = JSON.parse(await readFile(path.join(templateDir, "sample.json"), "utf8"));

    const workspace = await createDocumentWorkspace(outRoot, templateDir);
    await writeDocumentData(workspace, sample);

    const result = await compileDocumentWorkspace(workspace);
    if (!result.success || !result.preview_paths?.[0]) {
      console.error(`✗ ${templateId}: compile failed`, result.diagnostics);
      failed = true;
      continue;
    }

    const previewPath = result.preview_paths[0];
    const previewBuf = await readFile(previewPath);

    try {
      await stat(goldenPath);
    } catch {
      await cp(previewPath, goldenPath);
      console.log(`+ ${templateId}: seeded golden-page1.png`);
      continue;
    }

    const goldenBuf = await readFile(goldenPath);
    const ratio = bufferDiffRatio(goldenBuf, previewBuf);

    if (ratio > PIXEL_DIFF_THRESHOLD) {
      console.error(
        `✗ ${templateId}: visual diff ${(ratio * 100).toFixed(2)}% exceeds ${(PIXEL_DIFF_THRESHOLD * 100).toFixed(0)}% threshold`,
      );
      console.error(
        `  golden sha256: ${createHash("sha256").update(goldenBuf).digest("hex").slice(0, 16)}`,
      );
      console.error(
        `  actual sha256: ${createHash("sha256").update(previewBuf).digest("hex").slice(0, 16)}`,
      );
      failed = true;
    } else {
      console.log(`✓ ${templateId}: visual diff ${(ratio * 100).toFixed(3)}%`);
    }
  }

  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
