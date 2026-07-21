import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  docforgeCompileDocument,
  docforgeCreateDocument,
  docforgeListMarketplaceTemplates,
  docforgeListTemplates,
  initService,
} from "../src/service.js";
import { getTemplateSample } from "../src/templates/registry.js";
import { ALL_TEMPLATE_IDS, MARKETPLACE_TEMPLATE_IDS, TEMPLATE_IDS } from "./helpers.js";

// golden.test.ts owns the plain validate+compile matrix (workspace path, all
// 23). This file pins the two things golden does not: that builtin templates
// export clean under PDF/UA-1 (the accessibility guarantee is the spec), and
// the catalog surface.

let dataRoot = "";

describe("PDF/UA-1 accessibility export", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "docforge-ua-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  for (const templateId of TEMPLATE_IDS) {
    it(`${templateId}: compiles under PDF/UA-1 with no accessibility error`, async () => {
      const sample = (await getTemplateSample(templateId)) as Record<string, unknown>;
      const created = await docforgeCreateDocument({
        template_id: templateId,
        data: sample,
        brand_id: "default",
        options: { accessibility: true, pdf_standard: "ua-1" },
      });
      expect(created.status).toBe("created");

      const compiled = await docforgeCompileDocument(created.document_id);
      expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
      expect(compiled.error_type).not.toBe("accessibility_error");
    });
  }
});

describe("template catalog", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "docforge-cat-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  it("lists every builtin and marketplace template", async () => {
    const { templates } = await docforgeListTemplates();
    const ids = templates.map((t) => t.id);
    for (const id of ALL_TEMPLATE_IDS) {
      expect(ids).toContain(id);
    }
    expect(templates.length).toBeGreaterThanOrEqual(ALL_TEMPLATE_IDS.length);
  });

  it("marketplace catalog lists only community templates", async () => {
    const { count, templates } = await docforgeListMarketplaceTemplates();
    expect(count).toBeGreaterThanOrEqual(MARKETPLACE_TEMPLATE_IDS.length);
    expect(templates.map((t) => t.id)).toEqual(
      expect.arrayContaining([...MARKETPLACE_TEMPLATE_IDS]),
    );
  });
});
