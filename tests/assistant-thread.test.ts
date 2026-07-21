import { describe, expect, it, vi } from "vitest";
import { handleAssistantThreadStarted } from "../src/slack/listeners/assistant-thread.js";

function args(context: { channel_id?: string } | undefined, channelInfo?: { name: string }) {
  const postMessage = vi.fn(async () => ({ ok: true }));
  const setSuggestedPrompts = vi.fn(async () => ({ ok: true }));
  const client = {
    chat: { postMessage },
    assistant: { threads: { setSuggestedPrompts } },
    conversations: {
      info: vi.fn(async () => ({ ok: true, channel: channelInfo ?? { name: "team-eng" } })),
    },
  };
  return {
    postMessage,
    setSuggestedPrompts,
    payload: {
      client,
      logger: { debug: vi.fn(), error: vi.fn() },
      event: {
        assistant_thread: { channel_id: "D_PANE", thread_ts: "1.1", context },
      },
    } as never,
  };
}

describe("assistant pane onboarding", () => {
  it("greets the user and offers suggested prompts when the pane opens", async () => {
    const { postMessage, setSuggestedPrompts, payload } = args(undefined);
    await handleAssistantThreadStarted(payload);

    // The pane is not silent — Forge introduces itself.
    expect(postMessage).toHaveBeenCalledTimes(1);
    const text = postMessage.mock.calls[0][0].text as string;
    expect(text).toMatch(/I'm Forge/i);
    expect(text).toMatch(/draft|proposal|status/i);

    // And it offers tappable starting points.
    expect(setSuggestedPrompts).toHaveBeenCalledTimes(1);
    const prompts = setSuggestedPrompts.mock.calls[0][0].prompts as unknown[];
    expect(prompts.length).toBeGreaterThanOrEqual(4);
  });

  it("mentions the channel it was opened from", async () => {
    const { postMessage, setSuggestedPrompts, payload } = args(
      { channel_id: "C_SALES" },
      { name: "sales-northstar" },
    );
    await handleAssistantThreadStarted(payload);

    const text = postMessage.mock.calls[0][0].text as string;
    expect(text).toContain("#sales-northstar");
    const title = setSuggestedPrompts.mock.calls[0][0].title as string;
    expect(title).toContain("sales-northstar");
  });
});
