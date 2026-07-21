import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { parseTypstStderr } from "../src/compile/diagnostics.js";
import {
  docforgeCompileDocument,
  docforgeCreateDocument,
  docforgeExportDocument,
  docforgeGenerateTemplateScaffold,
  docforgeLintDocument,
  docforgePreviewDocument,
  docforgeRegisterCustomTemplate,
  docforgeRepairDocument,
  docforgeValidateTemplatePackage,
  docforgeVisualQADocument,
  initService,
  notesToExecutiveMemoData,
} from "../src/service.js";
import { sanitizeHostPaths } from "../src/security/paths.js";
import { validatePdfStandardOptions } from "../src/security/pdf-standard.js";
import { validateTypstSnippets } from "../src/validation/typst-snippets.js";
import { DOCUMENT_TTL_MS } from "../src/config.js";
import { templateDir } from "./helpers.js";

let dataRoot = "";

describe("hardening — security", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "docforge-hardening-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  it("rejects path traversal in template_id registration", async () => {
    const out = await mkdtemp(path.join(dataRoot, "tpl-src-"));
    const scaffold = await docforgeGenerateTemplateScaffold({
      template_id: "safe_tpl",
      name: "Safe",
      description: "Test",
      output_path: out,
      fields: [{ name: "summary", type: "string", required: true }],
    });
    expect(scaffold.success).toBe(true);

    const registered = await docforgeRegisterCustomTemplate({
      template_id: "../escape",
      source_path: out,
    });
    expect(registered.success).toBe(false);
  });

  it("rejects template source_path outside allowed roots", async () => {
    const result = await docforgeValidateTemplatePackage("/etc/passwd");
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toMatch(/allowed template source/i);
  });

  it("rejects oversize document data", async () => {
    const huge = "x".repeat(6 * 1024 * 1024);
    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data: { ...notesToExecutiveMemoData("x"), summary: huge },
    });
    expect(created.status).toBe("failed");
    expect(created.diagnostic?.message).toMatch(/maximum size/i);
  });

  it("rejects typst_snippets injection", () => {
    const bad = validateTypstSnippets({ footer_note: '#import "evil.typ"' });
    expect(bad.ok).toBe(false);
  });

  it("rejects PDF/UA + PDF/A incompatible options", () => {
    const bad = validatePdfStandardOptions({ pdf_standard: "a-2a", accessibility: true });
    expect(bad.ok).toBe(false);
  });

  it("strips host paths from compile diagnostics", () => {
    const stderr = `error: file not found\n/Users/secret/project/main.typ:12:4`;
    const d = parseTypstStderr(stderr);
    expect(d.message).not.toMatch(/\/Users\/secret/);
    expect(d.location?.file).toBe("main.typ");
  });

  it("sanitizeHostPaths redacts absolute paths", () => {
    expect(sanitizeHostPaths("/Users/alice/doc/output.pdf failed")).toBe("<path> failed");
  });

  it("export and preview omit host filesystem paths", async () => {
    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data: notesToExecutiveMemoData("Export path test"),
    });
    expect(created.status).toBe("created");
    const compiled = await docforgeCompileDocument(created.document_id!);
    expect(compiled.success).toBe(true);

    const preview = await docforgePreviewDocument({
      document_id: created.document_id!,
      pages: [1],
    });
    expect(preview.success).toBe(true);
    expect(JSON.stringify(preview)).not.toMatch(dataRoot);
    expect(preview.pages?.[0]).not.toHaveProperty("path");

    const exported = await docforgeExportDocument({
      document_id: created.document_id!,
      formats: ["pdf", "json", "typ"],
    });
    expect(exported.exports?.pdf).toBe("output.pdf");
    expect(exported.exports?.json).toBe("data.json");
    expect(JSON.stringify(exported)).not.toMatch(dataRoot);
  });

  it("rejects expired document handles after TTL", async () => {
    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data: notesToExecutiveMemoData("TTL test"),
    });
    expect(created.status).toBe("created");

    const { loadDocument, saveDocument } = await import("../src/documents/store.js");
    const doc = (await loadDocument(created.document_id!))!;
    doc.updated_at = new Date(Date.now() - DOCUMENT_TTL_MS - 1000).toISOString();
    await saveDocument(doc);

    const compiled = await docforgeCompileDocument(created.document_id!);
    expect(compiled.success).toBe(false);
    expect(compiled.agent_action).toMatch(/Create a new document/i);
  });

  it("serializes concurrent compile requests for same document", async () => {
    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data: notesToExecutiveMemoData("Race test"),
    });
    const id = created.document_id!;
    const [a, b] = await Promise.all([docforgeCompileDocument(id), docforgeCompileDocument(id)]);
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    const historyLen = a.compile_history?.length ?? 0;
    expect(historyLen).toBeGreaterThanOrEqual(1);
    expect(historyLen).toBeLessThanOrEqual(2);
  });
});

describe("hardening — agent workflow E2E", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "docforge-agent-e2e-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  async function fullAgentWorkflow(templateId: string, data: Record<string, unknown>) {
    const created = await docforgeCreateDocument({ template_id: templateId, data });
    expect(created.status).toBe("created");
    const id = created.document_id!;

    const compiled = await docforgeCompileDocument(id);
    expect(compiled.success).toBe(true);

    if (compiled.suggested_repairs?.length) {
      await docforgeRepairDocument({ document_id: id, repairs: compiled.suggested_repairs });
      const recompiled = await docforgeCompileDocument(id);
      expect(recompiled.success).toBe(true);
    }

    const lint = await docforgeLintDocument(id);
    expect(lint.success).toBe(true);

    const qa = await docforgeVisualQADocument(id);
    expect(qa.success).toBe(true);

    const preview = await docforgePreviewDocument({ document_id: id, pages: [1] });
    expect(preview.success).toBe(true);

    const exported = await docforgeExportDocument({ document_id: id, formats: ["pdf"] });
    expect(exported.success).toBe(true);
    expect(exported.exports?.pdf).toBe("output.pdf");
  }

  it("executive_memo: create → compile → lint → visual QA → export", async () => {
    await fullAgentWorkflow("executive_memo", notesToExecutiveMemoData("Board update Q2."));
  });

  it("sales_proposal: full agent workflow", async () => {
    const sample = JSON.parse(
      await readFile(path.join(templateDir("sales_proposal"), "sample.json"), "utf8"),
    );
    await fullAgentWorkflow("sales_proposal", sample);
  });

  it("kpi_report: full agent workflow", async () => {
    const sample = JSON.parse(
      await readFile(path.join(templateDir("kpi_report"), "sample.json"), "utf8"),
    );
    await fullAgentWorkflow("kpi_report", sample);
  });
});
