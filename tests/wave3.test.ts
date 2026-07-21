import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { validateBrandKit } from "../src/brand/registry.js";
import type { BrandKit } from "../src/brand/types.js";
import {
  csvAndNotesToKpiReport,
  docforgeCompileDocument,
  docforgeCreateDocument,
  docforgeExportDocument,
  initService,
} from "../src/service.js";
import { lintDocumentData } from "../src/lint/engine.js";
import { getTemplateSample } from "../src/templates/registry.js";

let dataRoot = "";

describe("Wave 3 — brand + accessibility", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "docforge-w3-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  it("rejects brand kit with low-contrast colors", () => {
    const bad: BrandKit = {
      id: "bad",
      name: "Bad Contrast",
      colors: {
        primary: "#CCCCCC",
        accent: "#DDDDDD",
        muted: "#EEEEEE",
        background: "#FFFFFF",
        text: "#DDDDDD",
      },
      fonts: { heading: "Libertinus Serif", body: "Libertinus Serif" },
      footer: "Test",
    };
    const result = validateBrandKit(bad);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.some((e) => e.includes("contrast"))).toBe(true);
  });

  it("rejects brand kit with logo but no logo_alt", () => {
    const bad: BrandKit = {
      id: "noalt",
      name: "No Alt",
      logo: "logo.svg",
      colors: {
        primary: "#111111",
        accent: "#2563eb",
        muted: "#64748b",
        background: "#FFFFFF",
        text: "#1A1A1A",
      },
      fonts: { heading: "Libertinus Serif", body: "Libertinus Serif" },
      footer: "Test",
    };
    const result = validateBrandKit(bad);
    expect(result.ok).toBe(false);
  });

  it("custom northstar brand produces branded KPI PDF", async () => {
    const csv = `metric,value,target,trend
ARR,4200000,4000000,up`;
    const notes = "Board update with custom Northstar branding.";
    const data = csvAndNotesToKpiReport(csv, notes);

    const created = await docforgeCreateDocument({
      template_id: "kpi_report",
      data,
      brand_id: "northstar",
      options: { accessibility: true, pdf_standard: "ua-1" },
    });
    expect(created.status).toBe("created");

    const compiled = await docforgeCompileDocument(created.document_id);
    expect(compiled.success).toBe(true);

    const exported = await docforgeExportDocument({
      document_id: created.document_id,
      formats: ["pdf"],
    });
    expect(exported.success).toBe(true);
    expect(exported.exports?.pdf).toMatch(/output\.pdf$/);
  });

  it("accessibility lint catches missing alt text on figures", async () => {
    const lint = await lintDocumentData(
      "executive_memo",
      {
        title: "Memo",
        summary: "Summary with enough words for lint.",
        sections: [{ title: "One", body: "Body" }],
        hero_image: { src: "chart.png" },
      },
      undefined,
      true,
    );
    expect(lint.issues.some((i) => i.check === "missing_alt_text")).toBe(true);
    expect(lint.ok).toBe(false);
  });

  it("accessibility lint catches skipped heading levels", async () => {
    const lint = await lintDocumentData(
      "executive_memo",
      {
        title: "Memo",
        summary: "Summary with enough words for lint.",
        sections: [
          { title: "Intro", body: "A", heading_level: 1 },
          { title: "Skip", body: "B", heading_level: 3 },
        ],
      },
      undefined,
      true,
    );
    expect(lint.issues.some((i) => i.check === "heading_hierarchy")).toBe(true);
  });

  it("lint flags missing alt on figure data", async () => {
    const sample = await getTemplateSample("kpi_report");
    const lint = await lintDocumentData(
      "kpi_report",
      { ...(sample as Record<string, unknown>), figures: [{ src: "assets/chart.png" }] },
      1,
      true,
    );
    expect(lint.issues.some((i) => i.check === "missing_alt_text")).toBe(true);
    expect(lint.ok).toBe(false);
  });
});
