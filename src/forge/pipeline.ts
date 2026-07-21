import { access } from "node:fs/promises";
import path from "node:path";
import { loadDocument } from "../documents/store.js";
import {
  docforgeCompileDocument,
  docforgeCreateDocument,
  docforgeExportDocument,
  docforgeLintDocument,
  docforgeRepairDocument,
  initService,
} from "../service.js";
import { preflightFindingsAsLintIssues, runPreflightWithRepairs } from "../qa/preflight-repair.js";
import { getSharedMcpClient, resolvePdfPath } from "./mcp-client.js";
import {
  buildForgeReceipt,
  newBuildId,
  type ForgeBuildReceipt,
  type ProducePdfOptions,
  writeBuildReceipt,
} from "./receipt.js";
import { ForgePipelineError } from "./types.js";

export { ForgePipelineError } from "./types.js";
export type { ForgePipelineFailure, ForgePipelineStage } from "./types.js";
export type { ForgeBuildReceipt, ForgeGatherProvenance, ProducePdfOptions } from "./receipt.js";
export { buildForgeReceipt, newBuildId, sealFinalReceipt, writeBuildReceipt } from "./receipt.js";

export type ProducePdfResult = {
  documentId: string;
  pdfPath: string;
  receiptPath: string;
  receipt: ForgeBuildReceipt;
  via: "mcp" | "in-process";
};

type CompileMetrics = {
  duration_ms: number;
  page_count: number;
  attempts: number;
  repairs_applied: string[];
};

/**
 * Drive create → compile → (repair) → lint → preflight (visual QA) → export
 * through the DocForge MCP server over a stdio child process. Returns a full
 * build receipt alongside the PDF path.
 *
 * Set FORGE_MCP=off to force the in-process path (used by unit tests).
 */
export async function producePdf(
  templateId: string,
  data: Record<string, unknown>,
  options: ProducePdfOptions,
): Promise<ProducePdfResult> {
  await initService();

  if (process.env.FORGE_MCP !== "off") {
    try {
      return await produceViaMcp(templateId, data, options);
    } catch (err) {
      if (err instanceof ForgePipelineError) throw err;
    }
  }

  return produceInProcess(templateId, data, options);
}

async function produceViaMcp(
  templateId: string,
  data: Record<string, unknown>,
  options: ProducePdfOptions,
): Promise<ProducePdfResult> {
  const pipelineStartedAt = Date.now();
  const buildId = newBuildId();
  const mcp = getSharedMcpClient();
  const brandId = options.brand_id ?? "default";
  const repairsApplied: string[] = [];

  const created = await mcp.createDocument({
    template_id: templateId,
    data,
    brand_id: brandId,
  });
  if (created.status !== "created" || !created.document_id) {
    throw new ForgePipelineError({ stage: "create", diagnostic: created.diagnostic });
  }
  const documentId = created.document_id;

  const compileMetrics = await compileWithRepairsMcp(mcp, documentId, repairsApplied);

  const lint = await mcp.lintDocument(documentId);
  if (!lint.success) {
    throw new ForgePipelineError({
      stage: "lint",
      documentId,
      issues: lint.issues,
      diagnostic: lint.diagnostic,
    });
  }

  const preflight = await runPreflightWithRepairs(
    documentId,
    {
      compile: async (id) => {
        const compiled = await mcp.compileDocument(id);
        return { success: compiled.success };
      },
    },
    { repairsApplied },
  );
  if (!preflight.ok) {
    throw new ForgePipelineError({
      stage: "preflight",
      documentId,
      issues: preflightFindingsAsLintIssues(preflight.findings),
    });
  }

  const lintAfterPreflight = await mcp.lintDocument(documentId);
  if (!lintAfterPreflight.success) {
    throw new ForgePipelineError({
      stage: "lint",
      documentId,
      issues: lintAfterPreflight.issues,
      diagnostic: lintAfterPreflight.diagnostic,
    });
  }

  const exported = await mcp.exportDocument(documentId, ["pdf"]);
  if (!exported.success) {
    throw new ForgePipelineError({
      stage: "export",
      documentId,
      diagnostic: exported.diagnostic,
    });
  }

  const pdfPath = resolvePdfPath(documentId);
  await assertPdfExists(pdfPath, documentId);

  const doc = await loadDocument(documentId);
  const receipt = buildForgeReceipt({
    build_id: buildId,
    workflow: options.workflow,
    template_id: templateId,
    template_version: doc?.template_version ?? "unknown",
    brand_id: brandId,
    document_id: documentId,
    pdf_basename: path.basename(pdfPath),
    gather: options.gather,
    transport: { path: "mcp", mcp_child_pid: mcp.childPid },
    compile_duration_ms: compileMetrics.duration_ms,
    page_count: compileMetrics.page_count,
    compile_attempts: compileMetrics.attempts,
    lint_issues: lintAfterPreflight.issues ?? lint.issues ?? [],
    preflight_findings: preflight.findings,
    repairs_applied: repairsApplied,
    pipeline_started_at: pipelineStartedAt,
    pipeline_completed_at: Date.now(),
    parent_build_id: options.parent_build_id,
    review_state: options.review_state,
    approved_by: options.approved_by,
    approved_at: options.approved_at,
    version_diff: options.version_diff,
  });

  const receiptPath = await writeBuildReceipt(documentId, receipt);
  return { documentId, pdfPath, receiptPath, receipt, via: "mcp" };
}

async function produceInProcess(
  templateId: string,
  data: Record<string, unknown>,
  options: ProducePdfOptions,
): Promise<ProducePdfResult> {
  const pipelineStartedAt = Date.now();
  const buildId = newBuildId();
  const brandId = options.brand_id ?? "default";
  const repairsApplied: string[] = [];

  const created = await docforgeCreateDocument({
    template_id: templateId,
    data,
    brand_id: brandId,
  });
  if (created.status !== "created" || !created.document_id) {
    throw new ForgePipelineError({ stage: "create", diagnostic: created.diagnostic });
  }

  const documentId = created.document_id;
  const compileMetrics = await compileWithRepairsInProcess(documentId, repairsApplied);

  const lint = await docforgeLintDocument(documentId);
  if (!lint.success) {
    throw new ForgePipelineError({
      stage: "lint",
      documentId,
      issues: lint.issues,
      diagnostic: lint.diagnostic,
    });
  }

  const preflight = await runPreflightWithRepairs(
    documentId,
    {
      compile: async (id) => {
        const compiled = await docforgeCompileDocument(id);
        return { success: compiled.success };
      },
    },
    { repairsApplied },
  );
  if (!preflight.ok) {
    throw new ForgePipelineError({
      stage: "preflight",
      documentId,
      issues: preflightFindingsAsLintIssues(preflight.findings),
    });
  }

  const lintAfterPreflight = await docforgeLintDocument(documentId);
  if (!lintAfterPreflight.success) {
    throw new ForgePipelineError({
      stage: "lint",
      documentId,
      issues: lintAfterPreflight.issues,
      diagnostic: lintAfterPreflight.diagnostic,
    });
  }

  const exported = await docforgeExportDocument({ document_id: documentId, formats: ["pdf"] });
  if (!exported.success) {
    throw new ForgePipelineError({
      stage: "export",
      documentId,
      diagnostic: exported.diagnostic,
    });
  }

  const doc = await loadDocument(documentId);
  const pdfPath = doc?.artifacts.pdf;
  if (!pdfPath) {
    throw new ForgePipelineError({
      stage: "export",
      documentId,
      diagnostic: {
        success: false,
        stage: "export",
        message: "PDF path missing after export",
        agent_action: "Recompile the document and export again.",
      },
    });
  }

  const receipt = buildForgeReceipt({
    build_id: buildId,
    workflow: options.workflow,
    template_id: templateId,
    template_version: doc.template_version,
    brand_id: brandId,
    document_id: documentId,
    pdf_basename: path.basename(pdfPath),
    gather: options.gather,
    transport: { path: "in-process" },
    compile_duration_ms: compileMetrics.duration_ms,
    page_count: compileMetrics.page_count,
    compile_attempts: compileMetrics.attempts,
    lint_issues: lintAfterPreflight.issues ?? lint.issues ?? [],
    preflight_findings: preflight.findings,
    repairs_applied: repairsApplied,
    pipeline_started_at: pipelineStartedAt,
    pipeline_completed_at: Date.now(),
    parent_build_id: options.parent_build_id,
    review_state: options.review_state,
    approved_by: options.approved_by,
    approved_at: options.approved_at,
    version_diff: options.version_diff,
  });

  const receiptPath = await writeBuildReceipt(documentId, receipt);
  return { documentId, pdfPath, receiptPath, receipt, via: "in-process" };
}

async function compileWithRepairsMcp(
  mcp: ReturnType<typeof getSharedMcpClient>,
  documentId: string,
  repairsApplied: string[],
): Promise<CompileMetrics> {
  let attempts = 0;
  let durationMs = 0;
  let pageCount = 0;

  let compiled = await mcp.compileDocument(documentId);
  attempts += 1;
  durationMs += compiled.duration_ms ?? 0;
  pageCount = compiled.page_count ?? pageCount;

  if (!compiled.success) {
    throw new ForgePipelineError({
      stage: "compile",
      documentId,
      diagnostic: compiled.diagnostics?.[0],
    });
  }

  if (compiled.suggested_repairs?.length) {
    repairsApplied.push(...compiled.suggested_repairs);
    await mcp.repairDocument(documentId, compiled.suggested_repairs);
    compiled = await mcp.compileDocument(documentId);
    attempts += 1;
    durationMs += compiled.duration_ms ?? 0;
    pageCount = compiled.page_count ?? pageCount;
    if (!compiled.success) {
      throw new ForgePipelineError({
        stage: "compile",
        documentId,
        diagnostic: compiled.diagnostics?.[0],
      });
    }
  }

  return {
    duration_ms: durationMs,
    page_count: pageCount,
    attempts,
    repairs_applied: repairsApplied,
  };
}

async function compileWithRepairsInProcess(
  documentId: string,
  repairsApplied: string[],
): Promise<CompileMetrics> {
  let attempts = 0;
  let durationMs = 0;
  let pageCount = 0;

  let compiled = await docforgeCompileDocument(documentId);
  attempts += 1;
  durationMs += compiled.duration_ms ?? 0;
  pageCount = compiled.page_count ?? pageCount;

  if (!compiled.success) {
    throw new ForgePipelineError({
      stage: "compile",
      documentId,
      diagnostic: compiled.diagnostics?.[0],
    });
  }

  if (compiled.suggested_repairs?.length) {
    repairsApplied.push(...compiled.suggested_repairs);
    await docforgeRepairDocument({ document_id: documentId, repairs: compiled.suggested_repairs });
    compiled = await docforgeCompileDocument(documentId);
    attempts += 1;
    durationMs += compiled.duration_ms ?? 0;
    pageCount = compiled.page_count ?? pageCount;
    if (!compiled.success) {
      throw new ForgePipelineError({
        stage: "compile",
        documentId,
        diagnostic: compiled.diagnostics?.[0],
      });
    }
  }

  return {
    duration_ms: durationMs,
    page_count: pageCount,
    attempts,
    repairs_applied: repairsApplied,
  };
}

async function assertPdfExists(pdfPath: string, documentId: string): Promise<void> {
  try {
    await access(pdfPath);
  } catch {
    throw new ForgePipelineError({
      stage: "export",
      documentId,
      diagnostic: {
        success: false,
        stage: "export",
        message: "PDF path missing after export",
        agent_action: "Recompile the document and export again.",
      },
    });
  }
}

/**
 * Compile to a page-1 PNG **without** exporting or delivering the PDF — used to
 * show a real preview of what approval will produce, while preserving the
 * "nothing is exported until you approve" guarantee. Runs in-process (a local,
 * throwaway render) and returns a document the caller must destroy after reading
 * the PNG. Throws ForgePipelineError on create/compile failure so the caller can
 * surface the same grounded diagnostic the real pipeline would.
 */
export async function producePreview(
  templateId: string,
  data: Record<string, unknown>,
): Promise<{ documentId: string; previewPath: string }> {
  await initService();

  const created = await docforgeCreateDocument({ template_id: templateId, data });
  if (created.status !== "created" || !created.document_id) {
    throw new ForgePipelineError({ stage: "create", diagnostic: created.diagnostic });
  }
  const documentId = created.document_id;

  let compiled = await docforgeCompileDocument(documentId);
  if (!compiled.success && compiled.suggested_repairs?.length) {
    await docforgeRepairDocument({ document_id: documentId, repairs: compiled.suggested_repairs });
    compiled = await docforgeCompileDocument(documentId);
  }
  if (!compiled.success) {
    throw new ForgePipelineError({
      stage: "compile",
      documentId,
      diagnostic: compiled.diagnostics?.[0],
    });
  }

  const doc = await loadDocument(documentId);
  const previewPath = doc?.artifacts.previews?.[0];
  if (!previewPath) {
    throw new ForgePipelineError({
      stage: "preview",
      documentId,
      diagnostic: {
        success: false,
        stage: "preview",
        message: "Preview PNG missing after compile",
        agent_action: "Recompile the document.",
      },
    });
  }

  return { documentId, previewPath };
}
