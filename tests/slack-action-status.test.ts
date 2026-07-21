import { describe, expect, it, vi } from "vitest";
import type { WebClient } from "@slack/web-api";
import { registerActionListeners } from "../src/slack/listeners/actions.js";
import { createPendingDraft } from "../src/slack/session.js";

const mocks = vi.hoisted(() => ({
  compileAndUpload: vi.fn(async () => true),
}));

vi.mock("../src/slack/workflows/compile-upload.js", () => ({
  compileAndUpload: mocks.compileAndUpload,
}));

type ActionHandler = (args: Record<string, unknown>) => Promise<void>;

function registerActions(): Map<string, ActionHandler> {
  const actions = new Map<string, ActionHandler>();
  registerActionListeners({
    action(actionId: string | RegExp, handler: ActionHandler) {
      if (typeof actionId === "string") actions.set(actionId, handler);
    },
    view() {
      // Not needed for this listener-level status check.
    },
  } as never);
  return actions;
}

describe("Slack confirm action status", () => {
  it("sets rotating loading messages before compiling a draft PDF", async () => {
    mocks.compileAndUpload.mockClear();
    const actions = registerActions();
    const ack = vi.fn(async () => undefined);
    const setStatus = vi.fn(async () => ({ ok: true }));
    const postMessage = vi.fn(async () => ({ ok: true }));
    const client = {
      assistant: { threads: { setStatus } },
      chat: { postMessage },
    } as unknown as WebClient;
    const pending = createPendingDraft({
      templateId: "executive_memo",
      templateLabel: "Executive Memo",
      draftData: {
        title: "Launch update",
        date: "2026-06-25",
        summary: "Launch is on track.",
        highlights: ["Design complete"],
        risks: ["None"],
        next_steps: ["Ship"],
      },
      filename: "Launch-Update.pdf",
      sourceText: "draft launch update",
      replyChannelId: "C_REPLY",
      threadTs: "1710000000.000100",
    });

    await actions.get("draft_confirm")!({
      ack,
      client,
      logger: { debug: vi.fn(), error: vi.fn() },
      body: {
        type: "block_actions",
        channel: { id: "C_ACTION" },
        message: { thread_ts: pending.threadTs },
        actions: [{ type: "button", value: pending.id }],
      },
    });

    expect(ack).toHaveBeenCalledOnce();
    expect(setStatus).toHaveBeenCalledWith({
      channel_id: "C_ACTION",
      thread_ts: pending.threadTs,
      status: "Compiling executive memo…",
      loading_messages: [
        "Validating Executive Memo data…",
        "Rendering PDF draft with DocForge…",
        "Preparing Slack upload…",
      ],
    });
    expect(mocks.compileAndUpload).toHaveBeenCalledWith(
      expect.objectContaining({ client }),
      expect.objectContaining({ replyChannelId: "C_REPLY", templateId: "executive_memo" }),
      pending.threadTs,
    );
  });
});
