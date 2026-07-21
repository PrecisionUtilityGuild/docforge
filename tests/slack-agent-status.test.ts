import { describe, expect, it, vi } from "vitest";
import {
  sayStreamProgress,
  setWorkflowStatus,
  setWorkflowTitle,
} from "../src/slack/agent/status.js";

const logger = { debug: vi.fn() };

function clientWith(setTitle: ReturnType<typeof vi.fn>) {
  return { assistant: { threads: { setTitle } } } as unknown as Parameters<
    typeof setWorkflowTitle
  >[0]["client"];
}

describe("assistant status helpers", () => {
  it("sets compact workflow status with rotating details", async () => {
    const setStatus = vi.fn(async () => ({ ok: true }));

    await setWorkflowStatus({ setStatus, logger } as never, "Gathering discovery context...", [
      "Searching Slack with Real-Time Search...",
      "Reading #sales-northstar...",
    ]);

    expect(setStatus).toHaveBeenCalledWith({
      status: "Gathering discovery context...",
      loading_messages: ["Searching Slack with Real-Time Search...", "Reading #sales-northstar..."],
    });
  });

  it("streams concise progress when sayStream is available", async () => {
    const append = vi.fn(async () => null);
    const stop = vi.fn(async () => ({ ok: true }));
    const sayStream = vi.fn(() => ({ append, stop }));

    await sayStreamProgress(
      { sayStream, logger } as never,
      "Source gathered: #sales-northstar (12 lines). Structuring approval preview.",
    );

    expect(sayStream).toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith({
      markdown_text: "Source gathered: #sales-northstar (12 lines). Structuring approval preview.",
    });
    expect(stop).toHaveBeenCalled();
  });
});

describe("setWorkflowTitle (assistant thread naming)", () => {
  it("titles the thread with channel + thread ids", async () => {
    const setTitle = vi.fn(async () => ({ ok: true }));
    await setWorkflowTitle({
      client: clientWith(setTitle),
      channelId: "C1",
      threadTs: "1.2",
      title: "Incident report — #incident-api-gateway",
    });
    expect(setTitle).toHaveBeenCalledWith({
      channel_id: "C1",
      thread_ts: "1.2",
      title: "Incident report — #incident-api-gateway",
    });
  });

  it("truncates over-long titles to 120 chars", async () => {
    const setTitle = vi.fn(async () => ({ ok: true }));
    await setWorkflowTitle({
      client: clientWith(setTitle),
      channelId: "C1",
      threadTs: "1.2",
      title: "x".repeat(200),
    });
    expect(setTitle.mock.calls[0]![0].title).toHaveLength(120);
  });

  it("silently no-ops when the thread cannot be titled (non-assistant thread)", async () => {
    const setTitle = vi.fn(async () => {
      throw new Error("not an assistant thread");
    });
    const debug = vi.fn();
    await expect(
      setWorkflowTitle({
        client: clientWith(setTitle),
        channelId: "C1",
        threadTs: "1.2",
        title: "Proposal — Northstar",
        logger: { debug },
      }),
    ).resolves.toBeUndefined();
    expect(debug).toHaveBeenCalled();
  });
});
