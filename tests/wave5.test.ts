import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { parseTypstStderr } from "../src/compile/diagnostics.js";
import {
  docforgeCompileDocument,
  docforgeCreateDocument,
  docforgeLintDocument,
  docforgeRepairDocument,
  initService,
  notesToExecutiveMemoData,
} from "../src/service.js";
import { getTemplateSample } from "../src/templates/registry.js";
import { assertTypstAvailable } from "../src/compile/typst.js";

let dataRoot = "";

function largeMemoData(sectionCount: number): Record<string, unknown> {
  const sections = Array.from({ length: sectionCount }, (_, i) => ({
    title: `Section ${i + 1}`,
    body: `Detailed analysis paragraph ${i + 1}. `.repeat(40),
  }));
  return {
    title: "Large Board Report",
    author: "DocForge QA",
    date: "2026-06-11",
    summary:
      "Comprehensive quarterly review spanning multiple operational areas and strategic initiatives.",
    sections,
    risks: [{ description: "Capacity constraints", severity: "medium" as const }],
    actions: [{ title: "Review hiring plan", owner: "CEO", due: "2026-07-01" }],
  };
}

describe("Wave 5 — repair + QA automation", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "docforge-wave5-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  it("translates unknown variable errors with rename_field suggestion", () => {
    const diag = parseTypstStderr('error: unknown variable "metrics"\n  at main.typ:12:4');
    expect(diag.error_type).toBe("compile_error");
    expect(diag.agent_action).toMatch(/rename/i);
    expect(diag.repair_available).toBe(true);
    expect(diag.suggested_repairs?.some((r) => r.startsWith("rename_field"))).toBe(true);
  });

  it("rename_field repair fixes metrics→kpis key mismatch", async () => {
    const sample = (await getTemplateSample("kpi_report")) as Record<string, unknown>;
    const wrongData = { ...sample, metrics: sample.kpis };
    delete wrongData.kpis;

    const created = await docforgeCreateDocument({
      template_id: "kpi_report",
      data: wrongData,
    });
    expect(created.status).toBe("failed");

    const repaired = await docforgeRepairDocument({
      document_id: created.document_id!,
      repairs: ["rename_field:metrics→kpis"],
    });
    expect(repaired.success).toBe(true);
    expect(repaired.data_changed).toBe(true);

    const compiled = await docforgeCompileDocument(created.document_id!);
    expect(compiled.success).toBe(true);
  });

  it("agent self-recovery: missing title via add_document_title", async () => {
    const data = notesToExecutiveMemoData("Recovery test memo");
    delete (data as Record<string, unknown>).title;

    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data,
    });
    expect(created.status).toBe("failed");

    await docforgeRepairDocument({
      document_id: created.document_id!,
      repairs: ["add_document_title:Recovered Memo Title"],
    });
    const compiled = await docforgeCompileDocument(created.document_id!);
    expect(compiled.success).toBe(true);
  });

  it("agent self-recovery: empty section removal", async () => {
    const data = notesToExecutiveMemoData("Section cleanup test");
    (data.sections as unknown[]).push({ title: "Empty", body: "   " });

    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data,
    });
    expect(created.status).toBe("created");

    await docforgeRepairDocument({
      document_id: created.document_id,
      repairs: [`remove_empty_section:${data.sections.length - 1}`],
    });
    const compiled = await docforgeCompileDocument(created.document_id);
    expect(compiled.success).toBe(true);
  });

  it("agent self-recovery: normalize_dates repair", async () => {
    const data = notesToExecutiveMemoData("Date normalization test");
    data.date = "06/11/2026";

    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data,
    });
    expect(created.status).toBe("created");

    await docforgeRepairDocument({
      document_id: created.document_id,
      repairs: ["normalize_dates:date"],
    });
    const compiled = await docforgeCompileDocument(created.document_id);
    expect(compiled.success).toBe(true);
  });

  it("agent self-recovery: add_default for missing section title", async () => {
    const data = notesToExecutiveMemoData("Default title test");
    (data.sections as Record<string, unknown>[])[1]!.title = "";

    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data,
    });
    expect(created.status).toBe("failed");

    await docforgeRepairDocument({
      document_id: created.document_id!,
      repairs: ["add_default:sections[1].title=Operations Update"],
    });
    const compiled = await docforgeCompileDocument(created.document_id!);
    expect(compiled.success).toBe(true);
  });

  it("agent self-recovery: truncate_string for oversized content", async () => {
    const data = notesToExecutiveMemoData("x".repeat(8000));

    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data,
    });
    expect(created.status).toBe("created");

    await docforgeRepairDocument({
      document_id: created.document_id,
      repairs: ["truncate_string:summary:500"],
    });
    const compiled = await docforgeCompileDocument(created.document_id);
    expect(compiled.success).toBe(true);
  });

  it("compile returns compile_history and layout_issues on success", async () => {
    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data: notesToExecutiveMemoData("History test"),
    });
    const compiled = await docforgeCompileDocument(created.document_id);
    expect(compiled.compile_history?.length).toBe(1);
    expect(compiled.compile_history?.[0]?.attempt).toBe(1);
    expect(compiled.compile_history?.[0]?.success).toBe(true);
  });

  it("lint returns suggested_repairs for fixable issues", async () => {
    const data = notesToExecutiveMemoData("TODO: replace with final content");
    (data.sections as Record<string, unknown>[]).push({ title: "Draft", body: "" });

    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data,
    });
    expect(created.status).toBe("created");
    await docforgeCompileDocument(created.document_id);

    const lint = await docforgeLintDocument(created.document_id);
    expect(lint.warning_count).toBeGreaterThan(0);
    expect(lint.suggested_repairs?.length).toBeGreaterThan(0);
  });

  it("large document (20+ sections) compiles without timeout", async () => {
    await assertTypstAvailable();
    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data: largeMemoData(24),
    });
    expect(created.status).toBe("created");

    const compiled = await docforgeCompileDocument(created.document_id);
    expect(compiled.success).toBe(true);
    expect(compiled.page_count).toBeGreaterThanOrEqual(1);
    expect(compiled.duration_ms).toBeLessThan(30_000);
  });
});

describe("Wave 5 — error translation corpus", () => {
  const corpus: Array<{ stderr: string; expectAction: RegExp }> = [
    { stderr: "unknown variable kpis", expectAction: /rename/i },
    { stderr: "file not found: assets/logo.png", expectAction: /asset/i },
    { stderr: "expected string, found integer", expectAction: /type/i },
    { stderr: "missing field title", expectAction: /add/i },
    { stderr: "syntax error at line 5", expectAction: /snippet|template|json\(\)/i },
    { stderr: "package not found: foo", expectAction: /package/i },
    { stderr: "math error in equation", expectAction: /equation|latex/i },
    { stderr: "compilation timed out", expectAction: /async|complexity|reduce/i },
    { stderr: "PDF/UA accessibility check failed alt text", expectAction: /accessibility/i },
    { stderr: "array index out of bounds", expectAction: /section|array/i },
  ];

  for (const { stderr, expectAction } of corpus) {
    it(`maps: ${stderr.slice(0, 40)}`, () => {
      const diag = parseTypstStderr(stderr);
      expect(diag.agent_action).toMatch(expectAction);
    });
  }

  it("covers 80%+ of corpus with specific (non-generic) actions", () => {
    let matched = 0;
    for (const { stderr, expectAction } of corpus) {
      const diag = parseTypstStderr(stderr);
      if (expectAction.test(diag.agent_action ?? "")) matched++;
    }
    expect(matched / corpus.length).toBeGreaterThanOrEqual(0.8);
  });
});
