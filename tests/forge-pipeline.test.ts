import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeSharedMcpClient } from "../src/forge/mcp-client.js";
import { producePdf } from "../src/forge/pipeline.js";
import { transcriptToIncidentReport } from "../src/service.js";

let dataRoot = "";

describe("forge pipeline", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "forge-pipeline-"));
    vi.stubEnv("DOCFORGE_DATA_ROOT", dataRoot);
  });

  afterEach(async () => {
    await closeSharedMcpClient();
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = "";
    vi.unstubAllEnvs();
  });

  it("producePdf returns absolute pdf path, receipt, and runs visual preflight", async () => {
    const data = transcriptToIncidentReport("14:02 Pager: error rate elevated");
    const { documentId, pdfPath, receipt, receiptPath } = await producePdf(
      "incident_report",
      data,
      {
        workflow: "incident",
        gather: { source_labels: ["#incident-api-gateway"], source_count: 5 },
      },
    );
    expect(documentId).toBeTruthy();
    expect(path.isAbsolute(pdfPath)).toBe(true);
    expect(pdfPath).toMatch(/output\.pdf$/);
    expect(path.isAbsolute(receiptPath)).toBe(true);
    expect(receipt.build_id).toMatch(/^[A-F0-9]{4}$/);
    expect(receipt.workflow).toBe("incident");
    expect(receipt.preflight.findings).toBeDefined();
    expect(receipt.lint.passed).toBe(true);
  });

  it("falls back in-process when the configured MCP server entry is unavailable", async () => {
    vi.stubEnv("FORGE_MCP_SERVER_ENTRY", path.join(dataRoot, "missing-index.js"));
    const data = transcriptToIncidentReport("14:02 Pager: error rate elevated");

    const { via, pdfPath, receipt } = await producePdf("incident_report", data, {
      workflow: "incident",
      gather: { source_labels: ["test"], source_count: 1 },
    });

    expect(via).toBe("in-process");
    expect(path.isAbsolute(pdfPath)).toBe(true);
    expect(receipt.transport.path).toBe("in-process");
  });
});
