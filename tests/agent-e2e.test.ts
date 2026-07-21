import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { handleForgeMessage } from "../src/slack/handler.js";
import { gatherProvenanceFromDraft } from "../src/forge/gather-provenance.js";
import { METRICS_INTAKE_CALLBACK } from "../src/slack/forms/metrics-intake.js";
import { encodeFormTarget } from "../src/slack/forms/types.js";
import { registerFormListeners } from "../src/slack/listeners/forms.js";
import {
  createPendingDraft,
  getPendingDraft,
  takePendingDraft,
  takePendingDraftChoice,
} from "../src/slack/session.js";
import { compileAndUpload } from "../src/slack/workflows/compile-upload.js";
import { inferDraftDocument } from "../src/slack/workflows/draft-inference.js";
import { initService } from "../src/service.js";
import { createFakeSlack, fakeContext, type FakeSlack } from "./helpers/fake-slack.js";

// Drive the real agent loop — routing, draft inference, the session store, and
// the shared compile→upload path — end to end against a fake Slack, with a real
// in-process DocForge compile. Only the Slack transport is faked; the PDF on the
// upload is read off disk, so a broken pipeline fails the test.
process.env.FORGE_MCP = "off";

let dataRoot = "";

/** Pull the confirm button's pending id out of the posted Block Kit card. */
function pendingIdFromCard(message: Record<string, unknown>, actionId: string): string {
  const blocks = (message.blocks ?? []) as Array<{
    type: string;
    elements?: Array<{ action_id?: string; value?: string }>;
  }>;
  for (const block of blocks) {
    const button = block.elements?.find((el) => el.action_id === actionId);
    if (button?.value) return button.value;
  }
  throw new Error(`no ${actionId} button found in posted card`);
}

/** Find the first posted message carrying a Block Kit card. */
function cardMessage(fake: FakeSlack): Record<string, unknown> {
  const card = fake.messages.find((m) => Array.isArray(m.blocks) && m.blocks.length > 0);
  if (!card) throw new Error("no card message was posted");
  return card;
}

function pdfUploads(fake: FakeSlack): FakeSlack["uploads"] {
  return fake.uploads.filter((u) => u.filename.match(/\.pdf$/i));
}

type RegisteredHandler = (args: Record<string, unknown>) => Promise<void>;

function registeredFormViews(): Map<string, RegisteredHandler> {
  const views = new Map<string, RegisteredHandler>();
  registerFormListeners({
    action() {
      // The E2E exercises modal submission, not opening.
    },
    view(callbackId: string, handler: RegisteredHandler) {
      views.set(callbackId, handler);
    },
  } as never);
  return views;
}

describe("agent e2e — message → confirm → PDF", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "agent-e2e-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  afterAll(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
  });

  it("draft: notes route → infer → confirm card → approve → real PDF uploaded", async () => {
    const fake = createFakeSlack();
    const notes =
      "draft We decided to adopt Postgres over Mongo for the primary store. " +
      "Option A: Mongo. Option B: Postgres. Accepted after the load test.";

    // 1. The message goes through real routing + inference + session.
    await handleForgeMessage(fakeContext(fake, notes));

    // A confirm card was posted and a status line shown — nothing compiled yet.
    const card = cardMessage(fake);
    expect(JSON.stringify(card)).toContain("Generate PDF");
    expect(fake.statuses.length).toBeGreaterThan(0);
    expect(pdfUploads(fake)).toHaveLength(0);

    // 2. Simulate the Approve button: claim the pending entry the real way.
    const pendingId = pendingIdFromCard(card, "draft_confirm");
    const pending = takePendingDraft(pendingId);
    expect(pending).toBeDefined();
    // The decision-shaped notes are routed to the decision_record template.
    expect(pending!.templateId).toBe("decision_record");

    // 3. Real compile + upload (in-process DocForge, fake Slack transport).
    const ok = await compileAndUpload(
      { client: fake.client, logger: fakeContext(fake, "").logger, say: fake.say },
      {
        workflow: "draft",
        templateId: pending!.templateId,
        draftData: pending!.draftData,
        filename: pending!.filename,
        replyChannelId: pending!.replyChannelId,
        gather: {
          source_labels: ["pasted notes"],
          source_count: 1,
          gather_method: "draft_inference",
        },
        errorLabel: "draft PDF",
        uploadStatus: "Uploading PDF…",
      },
      pending!.threadTs,
    );

    expect(ok).toBe(true);
    const pdfUpload = pdfUploads(fake)[0];
    expect(pdfUpload).toBeTruthy();
    expect(pdfUpload!.bytes).toBeGreaterThan(1000);

    // Claim-on-read: a double-clicked Approve cannot compile the same draft twice.
    expect(takePendingDraft(pendingId)).toBeUndefined();
  });

  it("draft: ambiguous notes ask with a picker, then a pick reaches a confirm card", async () => {
    const fake = createFakeSlack();
    const notes =
      "draft Decision pending on caching. Meeting agenda: discuss the options. " +
      "Attendees listed. Standup prep. Decided nothing yet, alternatives still open.";

    await handleForgeMessage(fakeContext(fake, notes));

    // A picker card is posted — buttons, no confirm card, and nothing compiled.
    const card = cardMessage(fake);
    const cardJson = JSON.stringify(card);
    expect(cardJson).toMatch(/draft_pick_/);
    expect(cardJson).not.toContain("Generate PDF");
    expect(fake.uploads).toHaveLength(0);

    // Simulate a pick: claim the held choice and rebuild with the chosen template,
    // exactly as the draft_pick_* action handler does.
    const blocks = (card.blocks ?? []) as Array<{
      elements?: Array<{ action_id?: string; value?: string }>;
    }>;
    const pick = blocks
      .flatMap((b) => b.elements ?? [])
      .find((el) => el.action_id?.startsWith("draft_pick_"));
    expect(pick?.value).toBeTruthy();
    const [choiceId, templateId] = pick!.value!.split("::");

    const choice = takePendingDraftChoice(choiceId);
    expect(choice).toBeDefined();
    const inference = inferDraftDocument(choice!.sourceText, new Date(), templateId as never);
    const pending = createPendingDraft({
      templateId: inference.templateId,
      templateLabel: inference.templateLabel,
      draftData: inference.draftData,
      filename: inference.filename,
      replyChannelId: choice!.replyChannelId,
      threadTs: choice!.threadTs,
    });

    // The pick yielded a real, confirmable pending draft of the chosen template.
    expect(getPendingDraft(pending.id)?.templateId).toBe(templateId);
    // The choice is single-use — a double-clicked picker button can't re-fire.
    expect(takePendingDraftChoice(choiceId)).toBeUndefined();
  });

  it("draft: confirm card holds pending draft until generate", async () => {
    const fake = createFakeSlack();
    await handleForgeMessage(
      fakeContext(
        fake,
        "draft # Launch Plan\nWe ship Q3. Risk: onboarding slow. Recommendation: wizard.",
      ),
    );

    const card = cardMessage(fake);
    expect(JSON.stringify(card)).toContain("draft_confirm");
    expect(JSON.stringify(card)).not.toContain("draft_preview");
    const pendingId = pendingIdFromCard(card, "draft_confirm");

    const pending = getPendingDraft(pendingId);
    expect(pending).toBeDefined();
    expect(pending!.templateId).toBeTruthy();
  });

  it("status: read a channel → confirm card → approve → real status PDF", async () => {
    const channel = [
      "Deployed the new CI pipeline to staging, on track for prod next week.",
      "API gateway integration is delayed — waiting on partner sandbox certification.",
      "Blocked on finance approval for the reserved instance commitment.",
      "Next steps: run the gateway cutover dry run on June 17.",
    ];
    const fake = createFakeSlack(channel);
    await handleForgeMessage(fakeContext(fake, "status for this channel"));

    // A status confirm card was posted; nothing compiled yet.
    const card = cardMessage(fake);
    const json = JSON.stringify(card);
    expect(json).toContain("status_confirm");
    expect(json).toMatch(/Status —/i);
    expect(pdfUploads(fake)).toHaveLength(0);

    // Claim like status_confirm does and compile for real.
    const { takePendingStatus } = await import("../src/slack/session.js");
    const pendingId = pendingIdFromCard(card, "status_confirm");
    const pending = takePendingStatus(pendingId);
    expect(pending).toBeDefined();
    expect(pending!.draftData.workstreams).toBeTruthy();

    const ok = await compileAndUpload(
      { client: fake.client, logger: fakeContext(fake, "").logger, say: fake.say },
      {
        workflow: "status",
        templateId: "project_status",
        draftData: pending!.draftData,
        filename: pending!.filename,
        replyChannelId: pending!.replyChannelId,
        gather: { source_labels: ["#team-eng"], source_count: 4, gather_method: "channel_history" },
        errorLabel: "status report",
        uploadStatus: "Uploading PDF…",
      },
      pending!.threadTs,
    );

    expect(ok).toBe(true);
    const pdfUpload = pdfUploads(fake)[0];
    expect(pdfUpload!.bytes).toBeGreaterThan(1000);
    expect(takePendingStatus(pendingId)).toBeUndefined();
  });

  it("metrics form: monthly metrics modal → confirm card → approve → real PDF uploaded", async () => {
    const fake = createFakeSlack();
    const views = registeredFormViews();

    await views.get(METRICS_INTAKE_CALLBACK)!({
      ack: async () => undefined,
      client: fake.client,
      logger: fakeContext(fake, "").logger,
      view: {
        private_metadata: encodeFormTarget({
          userId: "U_TEST",
          channelId: "C_TEST",
          threadTs: "1700000000.000100",
        }),
        state: {
          values: {
            pack_block: { pack_select: { selected_option: { value: "monthly_metrics" } } },
            period_block: { period_input: { value: "2026-Q1" } },
            csv_block: {
              csv_input: {
                value:
                  "metric,value,target,trend,unit\nRevenue,120,100,up,USD\nUsers,4500,4000,up,count",
              },
            },
            commentary_block: { commentary_input: { value: "Strong quarter." } },
          },
        },
      },
    });

    const card = cardMessage(fake);
    const json = JSON.stringify(card);
    expect(json).toContain("draft_confirm");
    expect(json).not.toContain("draft_retemplate");
    expect(pdfUploads(fake)).toHaveLength(0);

    const pendingId = pendingIdFromCard(card, "draft_confirm");
    const pending = takePendingDraft(pendingId);
    expect(pending).toBeDefined();
    expect(pending!.templateId).toBe("monthly_metrics");
    expect(pending!.filename).toBe("Monthly-Metrics-2026-Q1.pdf");
    expect(pending!.draftData.period).toBe("2026-Q1");

    const ok = await compileAndUpload(
      { client: fake.client, logger: fakeContext(fake, "").logger, say: fake.say },
      {
        workflow: "draft",
        templateId: pending!.templateId,
        draftData: pending!.draftData,
        filename: pending!.filename,
        replyChannelId: pending!.replyChannelId,
        gather: gatherProvenanceFromDraft(pending!),
        errorLabel: "draft PDF",
        uploadStatus: "Uploading PDF…",
      },
      pending!.threadTs,
    );

    expect(ok).toBe(true);
    const pdfUpload = pdfUploads(fake)[0];
    expect(pdfUpload!.filename).toBe("Monthly-Metrics-2026-Q1-DRAFT.pdf");
    expect(pdfUpload!.bytes).toBeGreaterThan(1000);
    expect(takePendingDraft(pendingId)).toBeUndefined();
  });

  it("help and summarize never compile or upload a PDF", async () => {
    const help = createFakeSlack();
    await handleForgeMessage(fakeContext(help, "help"));
    expect(help.uploads).toHaveLength(0);
    expect(JSON.stringify(help.messages)).toMatch(/draft|proposal|incident|board/i);

    const summarize = createFakeSlack();
    await handleForgeMessage(fakeContext(summarize, "summarize this thread"));
    expect(summarize.uploads).toHaveLength(0);
    expect(JSON.stringify(summarize.messages)).toMatch(/text only|no pdf/i);
  });

  it("a bare question mentioning 'pdf' does not start a workflow", async () => {
    const fake = createFakeSlack();
    await handleForgeMessage(fakeContext(fake, "is the pdf broken on page 2?"));
    expect(fake.uploads).toHaveLength(0);
    // Falls through to the unknown/help reply, not a confirm card.
    expect(fake.messages.every((m) => !JSON.stringify(m).includes("Generate PDF"))).toBe(true);
  });
});
