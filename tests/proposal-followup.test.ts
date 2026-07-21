import { describe, expect, it } from "vitest";
import { normalizePricingInput, parsePricingLines } from "../src/slack/gather/pricing.js";
import {
  isProposalPricingPromptMessage,
  looksLikePricingMessage,
} from "../src/slack/workflows/proposal-followup.js";

describe("proposal pricing follow-up", () => {
  it("strips @forge from multiline pricing paste", () => {
    const text = `<@U123> Solution engineering — $96000
Project management — $12000
Training — $8000`;
    expect(parsePricingLines(text)).toHaveLength(3);
    expect(looksLikePricingMessage(text)).toBe(true);
  });

  it("normalizes unicode dashes from Slack copy-paste", () => {
    const text = "Solution engineering — $96000";
    expect(normalizePricingInput(text)).toContain(" - ");
    expect(parsePricingLines(text)).toHaveLength(1);
  });

  it("recognizes the current pricing prompt text for thread recovery", () => {
    expect(
      isProposalPricingPromptMessage({
        text: "Source gathered and schema shape is ready. Add pricing to continue.",
        blocks: [
          {
            text: {
              text:
                "*Pricing needed* — totals come only from lines you provide.\n" +
                "Click *Enter pricing* or reply in this thread.",
            },
          },
        ],
      }),
    ).toBe(true);
  });
});
