import { describe, expect, it } from "vitest";
import { applyEscapeText } from "../src/repair/transforms.js";

describe("escape_text repair is a safe no-op (json() data renders #/$/\\ literally)", () => {
  it("never mutates content — would otherwise corrupt 'C# developer' -> 'C\\# developer'", () => {
    const data: Record<string, unknown> = { summary: "C# developer, $5 budget, path\\to\\file" };
    const before = data.summary;
    const r = applyEscapeText(data, "$.summary");
    expect(r.applied).toBe(false);
    expect(data.summary).toBe(before); // unchanged — no backslashes injected
  });

  it("is idempotent across repair-loop re-runs (no compounding escapes)", () => {
    const data: Record<string, unknown> = { title: "Q# results $$ 50%" };
    applyEscapeText(data, "$.title");
    applyEscapeText(data, "$.title");
    applyEscapeText(data, "$.title");
    expect(data.title).toBe("Q# results $$ 50%");
  });

  it("explains why it did nothing, so the agent doesn't keep retrying it", () => {
    const r = applyEscapeText({ summary: "#hash" }, "$.summary");
    expect(r.description.toLowerCase()).toContain("json()");
  });
});
