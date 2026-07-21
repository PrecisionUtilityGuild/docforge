import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  docforgeCompileDocument,
  docforgeCreateDocument,
  docforgeGenerateTemplateScaffold,
  docforgeRegisterCustomTemplate,
  docforgeRepairDocument,
  docforgeVisualQADocument,
  initService,
  notesToExecutiveMemoData,
} from "../src/service.js";
import { lintDocumentData } from "../src/lint/engine.js";
import { getTemplateSample } from "../src/templates/registry.js";

let dataRoot = "";

describe("Wave 7 — designer + ecosystem", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "docforge-wave7-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  it("custom template E2E: scaffold → register → create → compile", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "docforge-custom-tpl-"));
    const scaffold = await docforgeGenerateTemplateScaffold({
      template_id: "agent_brief",
      name: "Agent Brief",
      description: "Custom agent-generated brief template",
      output_path: out,
      fields: [
        { name: "summary", type: "string", required: true },
        { name: "next_steps", type: "array", required: true },
      ],
    });
    expect(scaffold.success).toBe(true);

    const registered = await docforgeRegisterCustomTemplate({
      template_id: "agent_brief",
      source_path: out,
    });
    expect(registered.success).toBe(true);

    const created = await docforgeCreateDocument({
      template_id: "agent_brief",
      data: {
        title: "Weekly Agent Brief",
        summary: "Pipeline status green.",
        next_steps: ["Ship Wave 7", "Run golden tests"],
      },
    });
    expect(created.status).toBe("created");

    const compiled = await docforgeCompileDocument(created.document_id);
    expect(compiled.success).toBe(true);
  });

  it("visual QA does not false-positive cramped layout on a normal memo", async () => {
    const data = notesToExecutiveMemoData("Baseline memo");
    data.sections = [
      { title: "Summary", body: "Short weekly update with one paragraph of content." },
    ];

    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data,
    });
    await docforgeCompileDocument(created.document_id);

    const lint = await lintDocumentData("executive_memo", data);
    expect(lint.issues.some((i) => i.check === "cramped_layout")).toBe(false);

    const qa = await docforgeVisualQADocument(created.document_id);
    expect(qa.success).toBe(true);
    expect(qa.findings?.some((f) => f.check === "cramped_layout")).toBe(false);
  });

  it("reflow_sections layout repair reduces section count", async () => {
    const sample = (await getTemplateSample("executive_memo")) as Record<string, unknown>;
    sample.sections = Array.from({ length: 10 }, (_, i) => ({
      title: `S${i}`,
      body: "Content",
    }));

    const created = await docforgeCreateDocument({
      template_id: "executive_memo",
      data: sample,
    });

    const repaired = await docforgeRepairDocument({
      document_id: created.document_id,
      repairs: ["reflow_sections:4"],
    });
    expect(repaired.success).toBe(true);
    expect(repaired.applied.some((a) => a.repair.startsWith("reflow_sections"))).toBe(true);
  });
});
