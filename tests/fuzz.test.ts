import { readFile } from "node:fs/promises";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { compileDocumentWorkspace } from "../src/compile/typst.js";
import { lintDocumentData } from "../src/lint/engine.js";
import { createDocumentWorkspace, writeDocumentData } from "../src/sandbox/workspace.js";
import { loadSchema, validateData } from "../src/validation/schema.js";
import { TEMPLATE_IDS, templateDir } from "./helpers.js";

describe("fuzz — malicious/edge inputs per template", () => {
  for (const templateId of TEMPLATE_IDS) {
    it(`${templateId}: rejects schema-invalid payload before compile`, async () => {
      const dir = templateDir(templateId);
      const schema = await loadSchema(dir);
      const validation = validateData(schema, { title: 12345 });
      expect(validation.ok).toBe(false);
    });

    it(`${templateId}: weird Unicode and injection-like strings compile or fail cleanly`, async () => {
      const dir = templateDir(templateId);
      const sample = JSON.parse(await readFile(path.join(dir, "sample.json"), "utf8")) as Record<
        string,
        unknown
      >;

      const fuzz = "🔥 RTL עברית \u202e injection ${#sys.crash} <script> TODO";
      if (typeof sample.summary === "string") sample.summary = fuzz;
      else if (typeof sample.commentary === "string") sample.commentary = fuzz;
      else if (typeof sample.executive_summary === "string") sample.executive_summary = fuzz;
      else if (typeof sample.abstract === "string") sample.abstract = fuzz;

      const root = await mkdtemp(path.join(tmpdir(), `docforge-fuzz-${templateId}-`));
      const workspace = await createDocumentWorkspace(root, dir);
      await writeDocumentData(workspace, sample);

      const result = await compileDocumentWorkspace(workspace);
      expect(typeof result.success).toBe("boolean");
      expect(result.diagnostics.length).toBeGreaterThan(0);

      await rm(root, { recursive: true, force: true });
    });

    it(`${templateId}: lint catches unfinished markers`, async () => {
      const dir = templateDir(templateId);
      const sample = JSON.parse(await readFile(path.join(dir, "sample.json"), "utf8")) as Record<
        string,
        unknown
      >;

      if (typeof sample.summary === "string") sample.summary = "TODO: fill in metrics";
      else if (typeof sample.commentary === "string") sample.commentary = "TODO: fill in metrics";
      else if (typeof sample.executive_summary === "string")
        sample.executive_summary = "TODO: fill in";
      else if (typeof sample.abstract === "string") sample.abstract = "TODO: fill in";
      else if (typeof sample.context === "string") sample.context = "TODO: fill in";
      else if (typeof sample.background === "string") sample.background = "TODO: fill in";
      else if (typeof sample.payment_terms === "string") sample.payment_terms = "TODO: fill in";
      else if (typeof sample.objectives === "string") sample.objectives = "TODO: fill in";
      else if (typeof sample.insights === "string") sample.insights = "TODO: fill in";
      else if (Array.isArray(sample.highlights) && sample.highlights[0]) {
        if (typeof sample.highlights[0] === "string") sample.highlights[0] = "TODO: highlight";
        else (sample.highlights[0] as Record<string, unknown>).text = "TODO: highlight";
      } else if (Array.isArray(sample.objectives)) {
        sample.objectives = ["TODO: objective"];
      } else if (Array.isArray(sample.insights)) {
        sample.insights = ["TODO: insight"];
      } else if (Array.isArray(sample.sections) && sample.sections[0]) {
        (sample.sections[0] as { body: string }).body = "TODO: section";
      }

      const lint = await lintDocumentData(templateId, sample);
      expect(lint.issues.some((i) => i.check === "todo_placeholders")).toBe(true);
    });
  }
});
