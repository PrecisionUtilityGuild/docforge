import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleBuildReceipt } from "./receipt-fixture.js";

const producePdf = vi.fn();
const uploadPdfToThread = vi.fn();
const docforgeDestroyDocument = vi.fn();
const createFinalizableDocument = vi.fn(() => ({ id: "fin-new" }));

vi.mock("../src/forge/pipeline.js", () => ({
  producePdf,
  ForgePipelineError: class ForgePipelineError extends Error {},
  sealFinalReceipt: vi.fn(),
}));
vi.mock("../src/slack/deliver/upload-pdf.js", () => ({ uploadPdfToThread }));
vi.mock("../src/service.js", () => ({ docforgeDestroyDocument }));
vi.mock("../src/slack/session.js", () => ({ createFinalizableDocument }));

const { redeliverEditedDraft } = await import("../src/slack/workflows/finalize.js");

function ctx() {
  return {
    client: { files: { delete: vi.fn(async () => undefined) } } as never,
    logger: { error: vi.fn(), debug: vi.fn() } as never,
    say: vi.fn(async () => undefined),
  };
}

describe("redeliverEditedDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads a revised draft with version diff summary", async () => {
    const receipt = sampleBuildReceipt({ build_id: "REV1", workflow: "draft" });
    producePdf.mockResolvedValue({
      documentId: "doc-1",
      pdfPath: "/tmp/revised.pdf",
      receiptPath: "/tmp/revised-receipt.json",
      receipt,
    });
    uploadPdfToThread.mockResolvedValue({ fileId: "F-new" });

    const c = ctx();
    const ok = await redeliverEditedDraft(c, {
      workflow: "draft",
      templateId: "technical_note",
      editedData: { title: "Edited Note", summary: "Updated", body_md: "Body" },
      filename: "Technical-Note.pdf",
      replyChannelId: "C1",
      threadTs: "111.222",
      previousDraftFileId: "F-old",
      previousDraftData: { title: "DRAFT — Original Note", summary: "Old", body_md: "Body" },
      previousReceipt: sampleBuildReceipt({ build_id: "DRAFT1" }),
    });

    expect(ok).toBe(true);
    expect(producePdf).toHaveBeenCalledWith(
      "technical_note",
      expect.any(Object),
      expect.objectContaining({
        version_diff: expect.objectContaining({ field_changes: expect.any(Number) }),
        parent_build_id: "DRAFT1",
      }),
    );
    expect(c.client.files.delete).toHaveBeenCalledWith({ file: "F-old" });
    expect(createFinalizableDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: "draft",
        templateId: "technical_note",
        draftFileId: "F-new",
        buildReceipt: receipt,
      }),
    );
  });

  it("does not fail the revised draft when superseded draft deletion fails", async () => {
    const receipt = sampleBuildReceipt();
    producePdf.mockResolvedValue({
      documentId: "doc-1",
      pdfPath: "/tmp/revised.pdf",
      receiptPath: "/tmp/revised-receipt.json",
      receipt,
    });
    uploadPdfToThread.mockResolvedValue({ fileId: "F-new" });

    const c = ctx();
    c.client.files.delete = vi.fn(async () => {
      throw new Error("rate limited");
    }) as never;

    const ok = await redeliverEditedDraft(c, {
      workflow: "proposal",
      templateId: "sales_proposal",
      editedData: { title: "Edited Proposal" },
      filename: "Northstar-Proposal.pdf",
      replyChannelId: "C1",
      threadTs: "111.222",
      previousDraftFileId: "F-old",
    });

    expect(ok).toBe(true);
    expect(c.logger.debug).toHaveBeenCalledWith(
      "superseded draft cleanup skipped",
      expect.any(Error),
    );
  });
});
