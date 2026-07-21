import { describe, expect, it } from "vitest";
import { buildPricingPromptBlocks } from "../src/slack/confirm/pricing-prompt.js";

describe("pricing prompt blocks", () => {
  it("includes enter pricing button with pending id", () => {
    const blocks = buildPricingPromptBlocks("pending-123");
    const actions = blocks.find((b) => b.type === "actions");
    expect(actions).toBeDefined();
    const button = (actions as { elements: Array<{ action_id: string; value: string }> })
      .elements[0];
    expect(button.action_id).toBe("proposal_open_pricing_modal");
    expect(button.value).toBe("pending-123");
  });
});
