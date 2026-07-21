import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleBuildReceipt } from "./receipt-fixture.js";

const producePdf = vi.fn();
const uploadPdfToThread = vi.fn();
const docforgeDestroyDocument = vi.fn();
const createFinalizableDocument = vi.fn(() => ({ id: "fin-1" }));

vi.mock("../src/forge/pipeline.js", () => ({
  producePdf,
  ForgePipelineError: class ForgePipelineError extends Error {},
}));
vi.mock("../src/slack/deliver/upload-pdf.js", () => ({ uploadPdfToThread }));
vi.mock("../src/service.js", () => ({ docforgeDestroyDocument }));
vi.mock("../src/slack/agent/status.js", () => ({ setThreadWorkflowStatus: vi.fn() }));
vi.mock("../src/slack/session.js", () => ({ createFinalizableDocument }));

const { compileAndUpload } = await import("../src/slack/workflows/compile-upload.js");

function ctx() {
  return {
    client: {} as never,
    logger: { error: vi.fn() } as never,
    say: vi.fn(async () => undefined),
  };
}

const baseSpec = {
  workflow: "board" as const,
  templateId: "kpi_report",
  draftData: { title: "Q2" },
  filename: "Board-Pack-Q3-Operating-Review.pdf",
  replyChannelId: "C1",
  gather: { source_labels: ["CSV upload"], source_count: 4 },
  errorLabel: "board pack",
  uploadStatus: "Uploading PDF…",
};

describe("compileAndUpload (shared workflow path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createFinalizableDocument.mockReturnValue({ id: "fin-1" });
  });

  it("uploads PDF only, destroys the document, and posts a slim delivery card", async () => {
    const receipt = sampleBuildReceipt({ build_id: "AB12", page_count: 3 });
    producePdf.mockResolvedValue({
      documentId: "doc-1",
      pdfPath: "/tmp/out.pdf",
      receiptPath: "/tmp/out-receipt.json",
      receipt,
      via: "mcp",
    });
    uploadPdfToThread.mockResolvedValue({ fileId: "F1" });

    const c = ctx();
    const ok = await compileAndUpload(c, baseSpec, "111.222");

    expect(ok).toBe(true);
    expect(uploadPdfToThread).toHaveBeenCalledWith(
      expect.objectContaining({
        initialComment: expect.stringMatching(/DRAFT.*3 pages/),
      }),
    );
    expect(c.say).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Approve or request changes below.",
        blocks: expect.any(Array),
      }),
    );
    expect(JSON.stringify((c.say as ReturnType<typeof vi.fn>).mock.calls[0][0])).not.toContain(
      "Forge Build",
    );
    expect(docforgeDestroyDocument).toHaveBeenCalledWith("doc-1");
    expect(createFinalizableDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: "board",
        templateId: "kpi_report",
        draftFileId: "F1",
        buildReceipt: receipt,
      }),
    );
  });

  it("reports compile failure without throwing and does not upload", async () => {
    producePdf.mockRejectedValue(new Error("schema invalid"));

    const c = ctx();
    const ok = await compileAndUpload(c, baseSpec, "111.222");

    expect(ok).toBe(false);
    expect(uploadPdfToThread).not.toHaveBeenCalled();
    expect(c.say).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("Could not compile board pack") }),
    );
  });

  it("surfaces upload-after-compile failure without creating a finalizable", async () => {
    const receipt = sampleBuildReceipt();
    producePdf.mockResolvedValue({
      documentId: "doc-1",
      pdfPath: "/tmp/out.pdf",
      receiptPath: "/tmp/out-receipt.json",
      receipt,
      via: "mcp",
    });
    uploadPdfToThread.mockRejectedValue(new Error("slack 500"));

    const c = ctx();
    const ok = await compileAndUpload(c, baseSpec, "111.222");

    expect(ok).toBe(false);
    expect(createFinalizableDocument).not.toHaveBeenCalled();
    expect(docforgeDestroyDocument).toHaveBeenCalledWith("doc-1");
    expect(c.say).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("upload failed") }),
    );
  });
});
