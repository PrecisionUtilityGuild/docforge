import { afterAll, beforeAll, expect, it } from "vitest";
import path from "node:path";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { transcriptToIncidentReport } from "../src/service.js";
import { DocForgeMcpClient, resolvePdfPath } from "../src/forge/mcp-client.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_ENTRY = path.join(ROOT, "dist", "index.js");

// These tests drive the real DocForge MCP server over a stdio child process —
// the "Slack agent uses the MCP" path. Requires `npm run build` (dist/index.js).
let serverBuilt = true;

beforeAll(async () => {
  try {
    await access(SERVER_ENTRY);
  } catch {
    serverBuilt = false;
  }
});

it("drives create → compile → lint → export over MCP and yields a real PDF", async () => {
  if (!serverBuilt) {
    console.warn("skipping MCP pipeline test: run `npm run build` first");
    return;
  }

  const data = transcriptToIncidentReport(
    "14:02 pager: api-gateway error rate 5.2%\n14:35 rollback deployed\n14:49 all clear",
  );

  const mcp = new DocForgeMcpClient(SERVER_ENTRY);
  await mcp.connect();
  try {
    const created = await mcp.createDocument({ template_id: "incident_report", data });
    expect(created.status).toBe("created");
    expect(created.document_id).toBeTruthy();
    const id = created.document_id!;

    const compiled = await mcp.compileDocument(id);
    expect(compiled.success).toBe(true);

    const lint = await mcp.lintDocument(id);
    expect(lint.success).toBe(true);

    const exported = await mcp.exportDocument(id, ["pdf"]);
    expect(exported.success).toBe(true);
    // MCP returns a sanitized basename, not a host path.
    expect(exported.exports?.pdf).toBe("output.pdf");

    // Absolute path is reconstructed from the shared data root by document_id.
    const pdfPath = resolvePdfPath(id);
    await expect(access(pdfPath)).resolves.toBeUndefined();

    await mcp.destroyDocument(id);
  } finally {
    await mcp.close();
  }
});

afterAll(() => {
  // no shared state
});
