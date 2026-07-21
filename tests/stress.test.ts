import { readFile } from "node:fs/promises";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { compileDocumentWorkspace } from "../src/compile/typst.js";
import { createDocumentWorkspace, writeDocumentData } from "../src/sandbox/workspace.js";
import { loadSchema, validateData } from "../src/validation/schema.js";
import { TEMPLATE_IDS, templateDir } from "./helpers.js";

describe("stress — all templates", () => {
  for (const templateId of TEMPLATE_IDS) {
    it(`${templateId}: 10k character string does not crash compile`, async () => {
      const dir = templateDir(templateId);
      const sample = JSON.parse(await readFile(path.join(dir, "sample.json"), "utf8")) as Record<
        string,
        unknown
      >;
      const giant = "x".repeat(10_000);

      if (typeof sample.summary === "string") sample.summary = giant;
      else if (typeof sample.commentary === "string") sample.commentary = giant;
      else if (typeof sample.executive_summary === "string") sample.executive_summary = giant;
      else if (typeof sample.abstract === "string") sample.abstract = giant;
      else if (Array.isArray(sample.sections) && sample.sections[0]) {
        (sample.sections[0] as { body: string }).body = giant;
      }

      const root = await mkdtemp(path.join(tmpdir(), `docforge-stress-${templateId}-`));
      const workspace = await createDocumentWorkspace(root, dir);
      await writeDocumentData(workspace, sample);

      const result = await compileDocumentWorkspace(workspace);
      expect(result.success).toBe(true);

      await rm(root, { recursive: true, force: true });
    });

    it(`${templateId}: minimal optional fields omitted still compiles`, async () => {
      const dir = templateDir(templateId);
      const sample = JSON.parse(await readFile(path.join(dir, "sample.json"), "utf8")) as Record<
        string,
        unknown
      >;

      const schema = await loadSchema(dir);
      const props = (schema as { properties?: Record<string, unknown> }).properties ?? {};
      const required = (schema as { required?: string[] }).required ?? [];

      const minimal: Record<string, unknown> = {};
      for (const key of required) {
        minimal[key] = sample[key];
      }

      for (const key of Object.keys(props)) {
        if (!required.includes(key) && sample[key] !== undefined) {
          delete minimal[key];
        }
      }

      const validation = validateData(schema, minimal);
      expect(validation.ok).toBe(true);

      const root = await mkdtemp(path.join(tmpdir(), `docforge-min-${templateId}-`));
      const workspace = await createDocumentWorkspace(root, dir);
      await writeDocumentData(workspace, minimal);

      const result = await compileDocumentWorkspace(workspace);
      expect(result.success).toBe(true);

      await rm(root, { recursive: true, force: true });
    });
  }
});
