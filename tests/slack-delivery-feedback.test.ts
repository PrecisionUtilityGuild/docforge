import { describe, expect, it } from "vitest";
import { formatDeliverySummary } from "../src/slack/confirm/delivery.js";
import { buildDeliveryFeedbackBlocks } from "../src/slack/confirm/feedback.js";
import { sampleBuildReceipt } from "./receipt-fixture.js";

describe("delivery feedback blocks", () => {
  it("shows approve controls only", () => {
    const blocks = buildDeliveryFeedbackBlocks({ finalizeId: "fin-123" });

    const payload = JSON.stringify(blocks);
    expect(payload).toContain("forge_feedback_approved");
    expect(payload).not.toContain("Forge Build");
    expect(payload).not.toContain("DRAFT");
    expect(payload).not.toContain("receipt");

    const actions = blocks.find((block) => block.type === "actions") as {
      elements: Array<{ action_id: string; value: string }>;
    };
    expect(actions.elements.map((element) => element.action_id)).toEqual([
      "forge_feedback_approved",
      "forge_feedback_needs_changes",
    ]);
    expect(actions.elements[0].value).toBe("fin-123");
  });

  it("formatDeliverySummary includes layout warnings when present", () => {
    const receipt = sampleBuildReceipt({
      preflight_findings: [
        {
          check: "possible_overflow",
          severity: "warning",
          message: "Page 1 dense",
          agent_action: "reflow",
          lint_missed: true,
        },
        {
          check: "blank_pages",
          severity: "warning",
          message: "Page 2 blank",
          agent_action: "add content",
          lint_missed: true,
        },
      ],
    });
    expect(formatDeliverySummary({ filename: "x.pdf", receipt })).toContain("2 layout warnings");
  });
});
