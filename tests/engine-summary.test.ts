import { describe, expect, it } from "vitest";
import { formatSchemaFieldPreview } from "../src/slack/confirm/engine-summary.js";

describe("schema field preview", () => {
  it("shows top narrative fields without walls of text", () => {
    const text = formatSchemaFieldPreview({
      title: "DRAFT — Board",
      summary: "Strong quarter with retention holding above target across segments.",
      commentary: "Pipeline improved in enterprise.",
      kpis: [
        { name: "ARR", value: "4.2M" },
        { name: "NRR", value: "112%" },
      ],
    });
    expect(text).toContain("*Summary:*");
    expect(text).toContain("Strong quarter");
    expect(text).toContain("*KPIs:*");
    expect(text.split("\n").length).toBeLessThanOrEqual(3);
  });
});
