import { readFile } from "node:fs/promises";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeAll } from "vitest";
import { assertTypstAvailable, compileDocumentWorkspace } from "../src/compile/typst.js";
import { createDocumentWorkspace, writeDocumentData } from "../src/sandbox/workspace.js";
import { loadSchema, validateData } from "../src/validation/schema.js";
import {
  ALL_TEMPLATE_IDS,
  MARKETPLACE_TEMPLATE_IDS,
  marketplaceDir,
  templateDir,
} from "./helpers.js";

// Whole-catalog compile matrix via the workspace path: every shipped template
// (builtin + marketplace) must have a sample that validates against its schema
// and compiles to a real PDF with at least one page and one preview. This is
// the single authoritative per-template compile check.
const MARKETPLACE = new Set<string>(MARKETPLACE_TEMPLATE_IDS);

function resolveDir(templateId: string): string {
  return MARKETPLACE.has(templateId)
    ? marketplaceDir(templateId as never)
    : templateDir(templateId as never);
}

describe("golden compile — all templates", () => {
  beforeAll(async () => {
    const version = await assertTypstAvailable();
    expect(version).toMatch(/typst/);
  });

  for (const templateId of ALL_TEMPLATE_IDS) {
    it(`${templateId}: sample.json validates and compiles`, async () => {
      const dir = resolveDir(templateId);
      const sample = JSON.parse(await readFile(path.join(dir, "sample.json"), "utf8"));
      const schema = await loadSchema(dir);
      const validation = validateData(schema, sample);
      expect(validation.ok).toBe(true);

      const root = await mkdtemp(path.join(tmpdir(), `docforge-golden-${templateId}-`));
      const workspace = await createDocumentWorkspace(root, dir);
      await writeDocumentData(workspace, sample);

      const result = await compileDocumentWorkspace(workspace);
      expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
      expect(result.page_count).toBeGreaterThanOrEqual(1);
      expect(result.pdf_path).toBeTruthy();
      expect(result.preview_paths?.length).toBeGreaterThanOrEqual(1);

      await rm(root, { recursive: true, force: true });
    });
  }
});
