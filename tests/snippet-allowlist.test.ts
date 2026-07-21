import { describe, expect, it } from "vitest";
import { validateTypstSnippets } from "../src/validation/typst-snippets.js";

describe("typst_snippets allowlist (F10)", () => {
  it("allows plain prose incl. em-dash and symbols", () => {
    expect(validateTypstSnippets({ footer_note: "Internal — do not distribute © 2026" }).ok).toBe(
      true,
    );
  });

  it("rejects function-call compute injection the old denylist missed", () => {
    // No #import/#let etc. — would have passed the old keyword denylist.
    expect(validateTypstSnippets({ footer_note: "#calc.fact(99999)" }).ok).toBe(false);
  });

  it("rejects math, raw, labels, escapes, references", () => {
    for (const evil of ["$x^2$", "`raw`", "<label>", "a\\b", "@ref"]) {
      expect(validateTypstSnippets({ footer_note: evil }).ok).toBe(false);
    }
  });

  it("still rejects imports and unknown slot keys", () => {
    expect(validateTypstSnippets({ footer_note: '#import "evil.typ"' }).ok).toBe(false);
    expect(validateTypstSnippets({ not_a_slot: "x" }).ok).toBe(false);
  });

  it("rejects over-length snippets", () => {
    expect(validateTypstSnippets({ footer_note: "a".repeat(501) }).ok).toBe(false);
  });
});
