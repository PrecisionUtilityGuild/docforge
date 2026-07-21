import { readFile } from "node:fs/promises";
import path from "node:path";
import { rm } from "node:fs/promises";
import { loadAndValidateBrand } from "./brand/registry.js";
import { compileDocumentWorkspace } from "./compile/typst.js";
import { getDataRoot } from "./config.js";
import { validateCharts } from "./data/charts.js";
import { csvToMonthlyMetricsData } from "./data/csv.js";
import { validateDiagram } from "./data/diagrams.js";
import {
  csvAndNotesToKpiReport,
  discoveryToSalesProposal,
  transcriptLinesToIncidentReport,
  transcriptToIncidentReport,
} from "./workflow-mappers/workflows.js";
import { transcriptLinesToProjectStatus } from "./workflow-mappers/project-status.js";
import {
  ensureDataRoot,
  getDocument,
  isDocumentExpired,
  documentExpiredDiagnostic,
  loadDocument,
  requireDocument,
  saveDocument,
} from "./documents/store.js";
import { schemaDiagnostic, sanitizeDiagnostics } from "./errors.js";
import { analyzeLayoutHeuristics } from "./layout/heuristics.js";
import { lintDocument } from "./lint/engine.js";
import { sourceCoverageScore } from "./lint/grounding.js";
import { repairDocumentData } from "./repair/engine.js";
import {
  suggestRepairsFromDiagnostic,
  suggestRepairsFromLintIssues,
} from "./repair/suggestions.js";
import { createDocumentWorkspace, writeDocumentData } from "./sandbox/workspace.js";
import { extractBrandKit } from "./brand/extract.js";
import { runVisualQA } from "./qa/visual.js";
import {
  generateTemplateScaffold,
  listMarketplaceTemplates,
  registerCustomTemplate,
  validateTemplatePackage,
} from "./templates/custom.js";
import {
  getTemplate,
  getTemplateReadme,
  getTemplateSample,
  getTemplateSchema,
  listTemplates,
} from "./templates/registry.js";
import type { CreateDocumentOptions, DocumentRecord } from "./types.js";
import { loadSchema, validateData } from "./validation/schema.js";
import { validateTypstSnippets } from "./validation/typst-snippets.js";
import { compareDocumentData } from "./versioning/diff.js";
import { loadVersionSnapshot, saveVersionSnapshot } from "./versioning/store.js";
import { refreshTemplateFiles } from "./versioning/upgrade.js";
import { assertDataSize, assertCsvSize } from "./security/limits.js";
import { validatePdfStandardOptions } from "./security/pdf-standard.js";
import { resolvePathInAllowedRoots, workspaceArtifactRef } from "./security/paths.js";
import { assertTypstVersionPin } from "./security/typst-version.js";

let initialized = false;
const compileInFlight = new Map<
  string,
  Promise<Awaited<ReturnType<typeof docforgeCompileDocumentInner>>>
>();

function touchDocumentAccess(doc: DocumentRecord): void {
  doc.updated_at = new Date().toISOString();
}

async function ensureActiveDocument(
  documentId: string,
): Promise<
  DocumentRecord | { expired: true; diagnostic: ReturnType<typeof documentExpiredDiagnostic> }
> {
  await loadDocument(documentId);
  const doc = getDocument(documentId);
  if (!doc) {
    throw new Error(
      `Unknown document_id: ${documentId}. Create a document first with docforge_create_document.`,
    );
  }
  if (isDocumentExpired(doc)) {
    return { expired: true, diagnostic: documentExpiredDiagnostic(documentId) };
  }
  touchDocumentAccess(doc);
  await saveDocument(doc);
  return doc;
}

function validateWave4Fields(data: Record<string, unknown>) {
  if (data.charts !== undefined) {
    const charts = validateCharts(data.charts);
    if (!charts.ok) {
      return schemaDiagnostic(charts.message, { agent_action: charts.agent_action });
    }
  }
  if (data.diagram !== undefined) {
    const diagram = validateDiagram(data.diagram);
    if (!diagram.ok) {
      return schemaDiagnostic(diagram.message, { agent_action: diagram.agent_action });
    }
  }
  return null;
}

export async function initService(): Promise<void> {
  if (initialized) return;
  await assertTypstVersionPin();
  await ensureDataRoot();
  initialized = true;
}

export async function docforgeListTemplates() {
  const templates = await listTemplates();
  return { templates };
}

export async function docforgeGetTemplateSchema(template_id: string, version?: string) {
  const { meta } = await getTemplate(template_id, version);
  const schema = await getTemplateSchema(template_id);
  const readme = await getTemplateReadme(template_id);
  const sample = await getTemplateSample(template_id);
  return {
    template_id: meta.id,
    version: meta.version,
    schema,
    readme,
    sample,
  };
}

export async function docforgeCreateDocument(input: {
  template_id: string;
  data: Record<string, unknown>;
  brand_id?: string;
  options?: CreateDocumentOptions;
  csv_attachment?: string;
}) {
  try {
    assertDataSize(input.data);
  } catch (err) {
    return {
      document_id: null,
      status: "failed",
      missing_fields: [],
      warnings: [],
      diagnostic: schemaDiagnostic(err instanceof Error ? err.message : String(err)),
    };
  }

  const pdfOpts = validatePdfStandardOptions(input.options);
  if (!pdfOpts.ok) {
    return {
      document_id: null,
      status: "failed",
      missing_fields: [],
      warnings: [],
      diagnostic: schemaDiagnostic(pdfOpts.message, { agent_action: pdfOpts.agent_action }),
    };
  }

  const brandId = input.brand_id ?? "default";
  const brandValidation = await loadAndValidateBrand(brandId);
  if (!brandValidation.ok) {
    return {
      document_id: null,
      status: "failed",
      missing_fields: [],
      warnings: brandValidation.errors,
      diagnostic: schemaDiagnostic(
        `Brand kit validation failed: ${brandValidation.errors.join("; ")}`,
        {
          error_type: "schema_error",
          agent_action: brandValidation.agent_action,
        },
      ),
    };
  }

  let data = input.data;
  if (input.csv_attachment) {
    try {
      assertCsvSize(input.csv_attachment);
    } catch (err) {
      return {
        document_id: null,
        status: "failed",
        missing_fields: [],
        warnings: [],
        diagnostic: schemaDiagnostic(err instanceof Error ? err.message : String(err)),
      };
    }
    if (input.template_id !== "monthly_metrics") {
      return {
        document_id: null,
        status: "failed",
        missing_fields: [],
        warnings: [],
        diagnostic: schemaDiagnostic(
          "csv_attachment is only supported for monthly_metrics template",
          {
            agent_action: "Use template_id monthly_metrics or omit csv_attachment.",
          },
        ),
      };
    }
    const csvData = csvToMonthlyMetricsData(
      input.csv_attachment,
      typeof data.title === "string" ? data.title : undefined,
    );
    data = { ...csvData, ...data };
  }

  const wave4Error = validateWave4Fields(data);
  if (wave4Error) {
    return {
      document_id: null,
      status: "failed",
      missing_fields: [],
      warnings: [],
      diagnostic: wave4Error,
    };
  }

  if (input.options?.typst_snippets) {
    data = { ...data, typst_snippets: input.options.typst_snippets };
  }
  const snippetCheck = validateTypstSnippets(data.typst_snippets);
  if (!snippetCheck.ok) {
    return {
      document_id: null,
      status: "failed",
      missing_fields: [],
      warnings: [],
      diagnostic: schemaDiagnostic(snippetCheck.message, {
        agent_action: snippetCheck.agent_action,
      }),
    };
  }

  const { meta, dir } = await getTemplate(input.template_id);
  const schema = await loadSchema(dir);
  const validation = validateData(schema, data);

  if (!validation.ok) {
    const workspace = await createDocumentWorkspace(getDataRoot(), dir, brandValidation.kit);
    const document_id = path.basename(workspace);
    const doc: DocumentRecord = {
      document_id,
      template_id: meta.id,
      template_version: meta.version,
      document_version: 1,
      brand_id: brandId,
      status: "failed",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      data,
      options: {
        accessibility: pdfOpts.accessibility,
        pdf_standard: pdfOpts.pdf_standard,
      },
      compile_history: [],
      version_history: [],
      workspace_path: workspace,
      artifacts: {},
      warnings: validation.missing_fields.map((f) => `missing:${f}`),
    };
    await saveDocument(doc);
    return {
      document_id,
      status: "failed",
      missing_fields: validation.missing_fields,
      warnings: doc.warnings,
      diagnostic: validation.diagnostic,
    };
  }

  const workspace = await createDocumentWorkspace(getDataRoot(), dir, brandValidation.kit);
  const document_id = path.basename(workspace);
  await writeDocumentData(workspace, data);

  const doc: DocumentRecord = {
    document_id,
    template_id: meta.id,
    template_version: meta.version,
    document_version: 1,
    brand_id: brandId,
    status: "created",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    data,
    options: {
      accessibility: pdfOpts.accessibility,
      pdf_standard: pdfOpts.pdf_standard,
    },
    compile_history: [],
    version_history: [],
    workspace_path: workspace,
    artifacts: {},
    warnings: [],
  };

  const initialSnapshot = await saveVersionSnapshot(doc);
  doc.version_history = [initialSnapshot];

  await saveDocument(doc);
  return {
    document_id,
    status: "created",
    missing_fields: [],
    warnings: [],
  };
}

export async function docforgeCompileDocument(document_id: string) {
  const existing = compileInFlight.get(document_id);
  if (existing) return existing;

  const run = docforgeCompileDocumentInner(document_id).finally(() => {
    compileInFlight.delete(document_id);
  });
  compileInFlight.set(document_id, run);
  return run;
}

async function docforgeCompileDocumentInner(document_id: string) {
  const access = await ensureActiveDocument(document_id);
  if ("expired" in access) {
    return {
      success: false,
      document_id,
      diagnostic: access.diagnostic,
      error_type: access.diagnostic.error_type,
      agent_action: access.diagnostic.agent_action,
      retryable: false,
    };
  }
  const doc = access;

  doc.status = "compiling";
  await saveDocument(doc);

  const attempt = doc.compile_history.length + 1;
  const result = await compileDocumentWorkspace(doc.workspace_path, {
    pdfStandard: doc.options.pdf_standard,
  });

  doc.compile_history.push({
    attempt,
    success: result.success,
    page_count: result.page_count,
    duration_ms: result.duration_ms,
    diagnostics: result.diagnostics,
  });

  if (result.success) {
    doc.status = "compiled";
    doc.artifacts.pdf = result.pdf_path;
    doc.artifacts.previews = result.preview_paths;
  } else {
    doc.status = "failed";
  }

  await saveDocument(doc);

  const diagnostics = sanitizeDiagnostics(result.diagnostics);
  const primary = diagnostics[0];
  let layout_issues: Awaited<ReturnType<typeof analyzeLayoutHeuristics>> = [];
  if (result.success && result.preview_paths?.length) {
    layout_issues = await analyzeLayoutHeuristics(
      result.preview_paths,
      result.page_count ?? result.preview_paths.length,
    );
  }

  const suggested_repairs = primary ? suggestRepairsFromDiagnostic(primary) : undefined;

  return {
    success: result.success,
    document_id,
    page_count: result.page_count,
    duration_ms: result.duration_ms,
    diagnostics,
    compile_history: doc.compile_history.map((entry) => ({
      ...entry,
      diagnostics: sanitizeDiagnostics(entry.diagnostics),
    })),
    layout_issues: layout_issues.length ? layout_issues : undefined,
    error_type: primary?.error_type,
    agent_action: primary?.agent_action,
    retryable: primary?.retryable,
    repair_available: primary?.repair_available ?? (suggested_repairs?.length ?? 0) > 0,
    suggested_repairs: suggested_repairs?.length ? suggested_repairs : primary?.suggested_repairs,
  };
}

export async function docforgePreviewDocument(input: {
  document_id: string;
  pages?: number[];
  dpi?: number;
}) {
  const access = await ensureActiveDocument(input.document_id);
  if ("expired" in access) {
    return { success: false, diagnostic: access.diagnostic };
  }
  const doc = access;

  if (!doc.artifacts.previews?.length) {
    return {
      success: false,
      diagnostic: schemaDiagnostic(
        "Document has no previews. Run docforge_compile_document first.",
        {
          stage: "preview",
          agent_action: "Call docforge_compile_document before preview_document.",
        },
      ),
    };
  }

  const previews = doc.artifacts.previews;
  const page_count = previews.length;
  const requested = input.pages?.length
    ? input.pages
    : Array.from({ length: page_count }, (_, i) => i + 1);

  const pages_out = [] as Array<{ page: number; base64: string }>;
  for (const pageNum of requested) {
    const file = previews[pageNum - 1];
    if (!file) continue;
    const buf = await readFile(file);
    pages_out.push({
      page: pageNum,
      base64: buf.toString("base64"),
    });
  }

  return {
    success: true,
    document_id: input.document_id,
    page_count,
    dpi: input.dpi ?? 120,
    pages: pages_out,
  };
}

export async function docforgeExportDocument(input: { document_id: string; formats: string[] }) {
  const access = await ensureActiveDocument(input.document_id);
  if ("expired" in access) {
    return { success: false, diagnostic: access.diagnostic };
  }
  const doc = access;
  const exports: Record<string, string> = {};

  if (input.formats.includes("pdf") && doc.artifacts.pdf) {
    exports.pdf = workspaceArtifactRef(doc.artifacts.pdf);
  }
  if (input.formats.includes("json")) {
    exports.json = "data.json";
  }
  if (input.formats.includes("typ")) {
    exports.typ = "main.typ";
  }
  if (input.formats.includes("png_preview") && doc.artifacts.previews) {
    exports.png_preview = doc.artifacts.previews.map(workspaceArtifactRef).join(",");
  }

  if (input.formats.includes("pdf") && !exports.pdf) {
    return {
      success: false,
      diagnostic: schemaDiagnostic("PDF not available. Compile the document first.", {
        stage: "export",
        agent_action: "Run docforge_compile_document, then export again.",
      }),
    };
  }

  return { success: true, document_id: input.document_id, exports };
}

export async function docforgeLintDocument(document_id: string) {
  const access = await ensureActiveDocument(document_id);
  if ("expired" in access) {
    return { success: false, document_id, diagnostic: access.diagnostic };
  }
  const doc = access;
  const result = await lintDocument(doc);
  if (result.ok) {
    doc.status = "linted";
    doc.updated_at = new Date().toISOString();
    await saveDocument(doc);
  }
  const suggested_repairs = suggestRepairsFromLintIssues(result.issues);
  return {
    success: result.ok,
    document_id,
    issues: result.issues,
    error_count: result.issues.filter((i) => i.severity === "error").length,
    warning_count: result.issues.filter((i) => i.severity === "warning").length,
    source_coverage_score: sourceCoverageScore(doc.data),
    repair_available: suggested_repairs.length > 0,
    suggested_repairs: suggested_repairs.length > 0 ? suggested_repairs : undefined,
  };
}

export async function docforgeRepairDocument(input: { document_id: string; repairs: string[] }) {
  const access = await ensureActiveDocument(input.document_id);
  if ("expired" in access) {
    return {
      success: false,
      diagnostic: access.diagnostic,
      applied: [],
      skipped: [],
      warnings: [],
      data_changed: false,
    };
  }
  const doc = access;
  const outcome = await repairDocumentData(doc, input.repairs);
  if (outcome.data_changed) {
    doc.document_version += 1;
    doc.status = "created";
    const snapshot = await saveVersionSnapshot(doc);
    doc.version_history.push(snapshot);
    await saveDocument(doc);
  }
  return {
    success: outcome.applied.length > 0,
    ...outcome,
  };
}

export async function runCompileForDocument(document_id: string) {
  return docforgeCompileDocument(document_id);
}

export async function docforgeSaveDocumentVersion(document_id: string) {
  await loadDocument(document_id);
  const doc = requireDocument(document_id);
  doc.document_version += 1;
  const snapshot = await saveVersionSnapshot(doc);
  doc.version_history.push(snapshot);
  doc.updated_at = new Date().toISOString();
  await saveDocument(doc);
  return {
    success: true,
    document_id,
    document_version: doc.document_version,
    saved_at: snapshot.saved_at,
  };
}

export async function docforgeCompareDocumentVersions(input: {
  document_id: string;
  from_version: number;
  to_version: number;
}) {
  await loadDocument(input.document_id);
  const doc = requireDocument(input.document_id);
  const from =
    (await loadVersionSnapshot(doc.workspace_path, input.from_version)) ??
    doc.version_history.find((v) => v.document_version === input.from_version);
  const to =
    (await loadVersionSnapshot(doc.workspace_path, input.to_version)) ??
    doc.version_history.find((v) => v.document_version === input.to_version);

  if (!from || !to) {
    return {
      success: false,
      document_id: input.document_id,
      diagnostic: schemaDiagnostic(
        `Version ${!from ? input.from_version : input.to_version} not found.`,
        { agent_action: "Use docforge_save_document_version or check version_history." },
      ),
    };
  }

  const diff = compareDocumentData(from.data, to.data);
  return {
    success: true,
    document_id: input.document_id,
    from_version: input.from_version,
    to_version: input.to_version,
    ...diff,
    preview_diff_available: Boolean(from.preview_paths?.length && to.preview_paths?.length),
  };
}

export async function docforgeUpgradeDocumentTemplate(input: {
  document_id: string;
  version?: string;
}) {
  await loadDocument(input.document_id);
  const doc = requireDocument(input.document_id);
  const { template_version } = await refreshTemplateFiles(doc, input.version);
  const previous = doc.template_version;
  doc.template_version = template_version;
  doc.status = "created";
  doc.updated_at = new Date().toISOString();
  await saveDocument(doc);
  return {
    success: true,
    document_id: input.document_id,
    previous_template_version: previous,
    template_version,
    agent_action: "Recompile the document after template upgrade.",
  };
}

export async function docforgeListMarketplaceTemplates() {
  const templates = await listMarketplaceTemplates();
  return { templates, count: templates.length };
}

export async function docforgeValidateTemplatePackage(source_path: string) {
  const result = await validateTemplatePackage(source_path);
  return { success: result.ok, errors: result.errors, meta: result.meta };
}

export async function docforgeRegisterCustomTemplate(input: {
  template_id: string;
  source_path: string;
}) {
  const result = await registerCustomTemplate(input);
  if (!result.ok) {
    return {
      success: false,
      errors: result.errors,
      diagnostic: schemaDiagnostic(`Template validation failed: ${result.errors?.join("; ")}`, {
        agent_action: "Fix template package structure and schema/sample alignment.",
      }),
    };
  }
  return { success: true, template_id: result.template_id };
}

export async function docforgeGenerateTemplateScaffold(input: {
  template_id: string;
  name: string;
  description: string;
  fields: Array<{ name: string; type: string; required?: boolean; description?: string }>;
  output_path: string;
}) {
  let outputPath: string;
  try {
    outputPath = await resolvePathInAllowedRoots(input.output_path, "output_path");
  } catch (err) {
    return {
      success: false,
      output_path: input.output_path,
      files: [],
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  const { mkdir, writeFile } = await import("node:fs/promises");
  const scaffold = generateTemplateScaffold(input);
  await mkdir(outputPath, { recursive: true });
  for (const [file, content] of Object.entries(scaffold.files)) {
    await writeFile(path.join(outputPath, file), content, "utf8");
  }
  const validation = await validateTemplatePackage(outputPath);
  return {
    success: validation.ok,
    output_path: outputPath,
    files: Object.keys(scaffold.files),
    errors: validation.errors,
  };
}

export async function docforgeVisualQADocument(document_id: string) {
  const access = await ensureActiveDocument(document_id);
  if ("expired" in access) {
    return { success: false, diagnostic: access.diagnostic };
  }
  const doc = access;
  if (!doc.artifacts.previews?.length) {
    return {
      success: false,
      diagnostic: schemaDiagnostic("No previews available. Compile first.", {
        agent_action: "Run docforge_compile_document before visual QA.",
      }),
    };
  }
  const lint = await lintDocument(doc);
  const qa = await runVisualQA(doc, lint.issues);
  return {
    success: qa.ok,
    document_id,
    findings: qa.findings,
    lint_missed_count: qa.findings.filter((f) => f.lint_missed).length,
    agent_action: qa.findings.some((f) => f.severity === "warning")
      ? "Apply layout repairs (reflow_sections, split_wide_table) and recompile."
      : undefined,
  };
}

export async function docforgeExtractBrandKit(input: {
  id: string;
  name: string;
  logo_path?: string;
  colors?: { primary?: string; accent?: string; muted?: string };
  footer?: string;
}) {
  const result = await extractBrandKit(input);
  if (!result.ok) {
    return { success: false, message: result.message };
  }
  const { writeFile, mkdir } = await import("node:fs/promises");
  const kitDir = path.join(getDataRoot(), "brand-kits", input.id);
  await mkdir(kitDir, { recursive: true });
  await writeFile(path.join(kitDir, "brand.json"), JSON.stringify(result.kit, null, 2), "utf8");
  if (input.logo_path) {
    try {
      const { cp } = await import("node:fs/promises");
      const { assertAssetSize, sniffImageMime, assertAllowedAssetMime } =
        await import("./security/limits.js");
      const logoPath = await resolvePathInAllowedRoots(input.logo_path, "logo_path");
      const logoBuf = await readFile(logoPath);
      assertAssetSize(logoBuf.length);
      assertAllowedAssetMime(sniffImageMime(logoBuf));
      await cp(logoPath, path.join(kitDir, path.basename(logoPath)));
    } catch {
      // logo copy optional
    }
  }
  return { success: true, brand_id: input.id, kit: result.kit };
}

export async function docforgeDestroyDocument(document_id: string) {
  const doc = await loadDocument(document_id);
  if (!doc) {
    return { success: true, document_id, destroyed: false, message: "Document already absent." };
  }

  try {
    await rm(doc.workspace_path, { recursive: true, force: true });
  } catch {
    // workspace may already be gone
  }

  doc.status = "destroyed";
  doc.updated_at = new Date().toISOString();
  await saveDocument(doc);

  return { success: true, document_id, destroyed: true };
}

export {
  csvAndNotesToKpiReport,
  discoveryToSalesProposal,
  transcriptLinesToIncidentReport,
  transcriptToIncidentReport,
  transcriptLinesToProjectStatus,
};
export { csvToMonthlyMetricsData } from "./data/csv.js";

/** Integration helper: notes-like payload → valid executive_memo data */
export function notesToExecutiveMemoData(notes: string): Record<string, unknown> {
  return {
    title: "Executive Update",
    author: "DocForge Agent",
    date: new Date().toISOString().slice(0, 10),
    summary: notes.slice(0, 500),
    sections: [
      { title: "Context", body: notes },
      { title: "Next Steps", body: "Review and distribute this memo to stakeholders." },
    ],
    risks: [{ description: "Scope may expand without timeline adjustment", severity: "medium" }],
    actions: [{ title: "Schedule leadership review", owner: "Team", due: "Next week" }],
  };
}

export async function runWorkflowSmoke(): Promise<{ document_id: string; pdf: string }> {
  await initService();
  const sample = await getTemplateSample("executive_memo");
  const created = await docforgeCreateDocument({
    template_id: "executive_memo",
    data: sample as Record<string, unknown>,
  });
  if (created.status !== "created" || !created.document_id) {
    throw new Error(`create failed: ${JSON.stringify(created)}`);
  }
  const documentId = created.document_id;
  const compiled = await docforgeCompileDocument(documentId);
  if (!compiled.success) {
    throw new Error(`compile failed: ${JSON.stringify(compiled)}`);
  }
  const exported = await docforgeExportDocument({
    document_id: documentId,
    formats: ["pdf"],
  });
  if (!exported.success || !exported.exports?.pdf) {
    throw new Error(`export failed: ${JSON.stringify(exported)}`);
  }
  return { document_id: documentId, pdf: exported.exports.pdf };
}
