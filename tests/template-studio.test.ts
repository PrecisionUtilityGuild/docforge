import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  parseExplicitTemplateId,
  parseScaffoldCommand,
  scaffoldRegisterAndProve,
} from "../src/templates/studio.js";
import { listCustomTemplates } from "../src/templates/custom.js";
import { getTemplate } from "../src/templates/registry.js";
import { initService } from "../src/service.js";

let dataRoot = "";

describe("template studio", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "template-studio-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  it("parses scaffold commands", () => {
    const parsed = parseScaffoldCommand(
      'template scaffold acme_brief --name "Acme Brief" --fields title,summary,body',
    );
    expect(parsed?.template_id).toBe("acme_brief");
    expect(parsed?.name).toBe("Acme Brief");
    expect(parsed?.fields.map((f) => f.name)).toEqual(["title", "summary", "body"]);
  });

  it("parses draft using template id", () => {
    expect(parseExplicitTemplateId("draft using acme_brief weekly notes")).toBe("acme_brief");
    expect(parseExplicitTemplateId("draft with template status_memo notes")).toBe("status_memo");
  });

  it("scaffoldRegisterAndProve registers a compilable custom template", async () => {
    const result = await scaffoldRegisterAndProve({
      template_id: "studio_test",
      name: "Studio Test",
      description: "Test template",
      fields: [
        { name: "summary", type: "string", required: true },
        { name: "body", type: "string" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.proof?.pdf_basename).toBe("output.pdf");

    const custom = await listCustomTemplates();
    expect(custom.some((t) => t.id === "studio_test")).toBe(true);

    const { meta } = await getTemplate("studio_test");
    expect(meta.name).toBe("Studio Test");
  }, 60_000);
});
