import { describe, expect, it } from "vitest";
import { draftFilename } from "../src/slack/confirm/draft.js";
import { extractFirstFileId } from "../src/slack/deliver/upload-pdf.js";

describe("draft filename labelling (A+C: unambiguous even if delete fails)", () => {
  it("inserts -DRAFT before the extension", () => {
    expect(draftFilename("INC-042-Report.pdf")).toBe("INC-042-Report-DRAFT.pdf");
    expect(draftFilename("Northstar-Proposal.pdf")).toBe("Northstar-Proposal-DRAFT.pdf");
  });

  it("does not mistake a dotted date segment for an extension", () => {
    // "Board-...-2026-06.pdf" — only the trailing .pdf is the extension.
    expect(draftFilename("Board-KPI-Pack-2026-06.pdf")).toBe("Board-KPI-Pack-2026-06-DRAFT.pdf");
  });

  it("handles a filename with no extension", () => {
    expect(draftFilename("report")).toBe("report-DRAFT");
  });

  it("keeps the final (clean) name distinct from the draft name", () => {
    const clean = "INC-042-Report.pdf";
    expect(draftFilename(clean)).not.toBe(clean);
  });
});

describe("upload file-id extraction (so the draft can be deleted on finalize)", () => {
  it("reads files[].id (flat shape)", () => {
    expect(extractFirstFileId({ files: [{ id: "F123" }] })).toBe("F123");
  });

  it("reads files[].files[].id (nested shape)", () => {
    expect(extractFirstFileId({ files: [{ files: [{ id: "F456" }] }] })).toBe("F456");
  });

  it("returns undefined when no id is present (delete is then skipped)", () => {
    expect(extractFirstFileId({})).toBeUndefined();
    expect(extractFirstFileId({ files: [] })).toBeUndefined();
    expect(extractFirstFileId({ files: [{ files: [] }] })).toBeUndefined();
  });
});
