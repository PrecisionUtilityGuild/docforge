import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPendingDraft } from "../src/slack/session.js";
import { runDocumentWorkflow } from "../src/slack/workflows/document.js";
import { initService } from "../src/service.js";
import { createFakeSlack, fakeContext } from "./helpers/fake-slack.js";

let dataRoot = "";

function pendingIdFromDraftCard(message: Record<string, unknown>): string {
  const blocks = (message.blocks ?? []) as Array<{
    type: string;
    elements?: Array<{ action_id?: string; value?: string }>;
  }>;
  const button = blocks
    .flatMap((block) => block.elements ?? [])
    .find((element) => element.action_id === "draft_confirm");
  if (!button?.value) throw new Error("draft_confirm button missing");
  return button.value;
}

describe("document workflow", () => {
  beforeEach(async () => {
    vi.stubEnv("FORGE_CONFIRM_PREVIEW", "off");
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "document-workflow-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = "";
  });

  it("routes explicit monthly metrics CSV with labelled period and clean commentary", async () => {
    const fake = createFakeSlack();
    const command = `document monthly_metrics
period: 2026-Q1
metric,value,target,trend,unit
Revenue,120,100,up,USD
Strong quarter.`;

    await runDocumentWorkflow(fakeContext(fake, command), command);

    const card = fake.messages.find((message) => JSON.stringify(message).includes("draft_confirm"));
    expect(card).toBeDefined();
    expect(JSON.stringify(card)).not.toContain("draft_retemplate");

    const pending = getPendingDraft(pendingIdFromDraftCard(card!));
    expect(pending?.templateId).toBe("monthly_metrics");
    expect(pending?.filename).toBe("Monthly-Metrics-2026-Q1.pdf");
    expect(pending?.draftData.period).toBe("2026-Q1");
    expect(pending?.draftData.commentary).toBe("Strong quarter.");
  });
});
