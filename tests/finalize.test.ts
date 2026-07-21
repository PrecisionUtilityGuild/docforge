import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  markTitleDraft,
  finalizeTitle,
  finalizeData,
  isDraftTitle,
} from "../src/slack/confirm/draft.js";
import {
  createFinalizableDocument,
  getFinalizableDocument,
  restoreFinalizableDocument,
  takeFinalizableDocument,
  discardFinalizableDocument,
} from "../src/slack/session.js";
import { transcriptToIncidentReport } from "../src/workflow-mappers/workflows.js";
import { loadSchema, validateData } from "../src/validation/schema.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("DRAFT marking / finalize (real state — approval really changes the doc)", () => {
  it("marks a title DRAFT and removes it on finalize, round-trip", () => {
    const marked = markTitleDraft({ title: "Production Incident Report" });
    expect(marked.title).toBe("DRAFT — Production Incident Report");
    expect(isDraftTitle(marked.title)).toBe(true);

    const final = finalizeTitle(marked);
    expect(final.title).toBe("Production Incident Report");
    expect(isDraftTitle(final.title)).toBe(false);
    // Finalize must NOT introduce any extra field — schemas are strict
    // (additionalProperties: false) and would reject e.g. a root `status`.
    expect(final).not.toHaveProperty("status");
    expect(Object.keys(final).sort()).toEqual(Object.keys(marked).sort());
  });

  it("is idempotent — double-marking and double-finalizing don't compound", () => {
    const once = markTitleDraft({ title: "X" });
    const twice = markTitleDraft(once);
    expect(twice.title).toBe("DRAFT — X");

    const f1 = finalizeTitle(twice);
    const f2 = finalizeTitle(f1);
    expect(f2.title).toBe("X");
  });

  it("finalize is safe on a title that was never marked", () => {
    expect(finalizeTitle({ title: "Plain" }).title).toBe("Plain");
  });

  it("strips proposal draft-only fields (discovery_notes) on finalize", () => {
    const draft = markTitleDraft({
      title: "Proposal — Omega",
      executive_summary: "…",
      discovery_notes: "raw internal chatter we don't want in the client final",
    });
    // In the draft, discovery_notes is present (useful provenance for review).
    expect(draft.discovery_notes).toBeDefined();

    const final = finalizeData(draft, "proposal");
    expect(final.discovery_notes).toBeUndefined(); // gone from the client final
    expect(final.title).toBe("Proposal — Omega"); // DRAFT removed
    // Other workflows are untouched by proposal's draft-only list.
    expect(finalizeData(draft, "incident").discovery_notes).toBeDefined();
  });

  it("a marked-then-finalized incident draft still passes the strict schema", async () => {
    // Regression: finalize must not inject fields the strict incident_report
    // schema (additionalProperties: false) rejects — that broke real finalize.
    const draft = markTitleDraft(
      transcriptToIncidentReport("14:02 api-gateway error rate spiking\n14:40 rollback, all clear"),
    );
    const final = finalizeTitle(draft);

    const schema = await loadSchema(path.join(repoRoot, "templates", "incident_report"));
    const result = validateData(schema, final);
    if (!result.ok) throw new Error(result.diagnostic.message);
    expect(result.ok).toBe(true);
    expect(final.title).not.toContain("DRAFT");
  });
});

describe("finalizable document store (atomic claim)", () => {
  const base = {
    workflow: "incident" as const,
    templateId: "incident_report",
    draftData: { title: "DRAFT — Production Incident Report" },
    filename: "INC-001-Report.pdf",
    replyChannelId: "C1",
    threadTs: "1700000000.0001",
  };

  it("can be claimed exactly once (double-click Approve cannot finalize twice)", () => {
    const doc = createFinalizableDocument(base);
    const first = takeFinalizableDocument(doc.id);
    const second = takeFinalizableDocument(doc.id);
    expect(first?.id).toBe(doc.id);
    expect(second).toBeUndefined();
  });

  it("discard removes it so a later Approve can't finalize a superseded draft", () => {
    const doc = createFinalizableDocument(base);
    discardFinalizableDocument(doc.id);
    expect(takeFinalizableDocument(doc.id)).toBeUndefined();
  });

  it("can restore a claimed draft with the same approval token when edit re-export fails", () => {
    const doc = createFinalizableDocument(base);
    const claimed = takeFinalizableDocument(doc.id);
    expect(claimed?.id).toBe(doc.id);
    expect(getFinalizableDocument(doc.id)).toBeUndefined();

    restoreFinalizableDocument(claimed!);

    expect(getFinalizableDocument(doc.id)?.id).toBe(doc.id);
    expect(takeFinalizableDocument(doc.id)?.id).toBe(doc.id);
  });

  it("does not restore an expired claimed draft", () => {
    const doc = createFinalizableDocument(base);
    expect(takeFinalizableDocument(doc.id)?.id).toBe(doc.id);
    const expired = { ...doc, createdAt: Date.now() - 31 * 60 * 1000 };

    restoreFinalizableDocument(expired);

    expect(getFinalizableDocument(doc.id)).toBeUndefined();
  });
});
