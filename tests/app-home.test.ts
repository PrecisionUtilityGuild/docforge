import { describe, expect, it, vi } from "vitest";
import { buildHomeView } from "../src/slack/agent/home.js";
import { handleAppHomeOpened } from "../src/slack/listeners/app-home.js";
import { WORKFLOWS } from "../src/forge/workflows.js";

describe("App Home", () => {
  it("renders a home view that lists every workflow", () => {
    const view = buildHomeView();
    expect(view.type).toBe("home");
    const json = JSON.stringify(view.blocks);
    for (const w of WORKFLOWS) {
      expect(json).toContain(w.label);
    }
    expect(json).toMatch(/never invented/i);
    expect(json).toContain("forge_home_open_draft_form");
    expect(json).toContain("forge_home_open_metrics_form");
  });

  it("publishes the home view when the home tab is opened", async () => {
    const publish = vi.fn(async () => ({ ok: true }));
    await handleAppHomeOpened({
      client: { views: { publish } },
      event: { tab: "home", user: "U1" },
      logger: { error: vi.fn() },
    } as never);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0].view.type).toBe("home");
  });

  it("ignores the messages tab (only publishes for home)", async () => {
    const publish = vi.fn(async () => ({ ok: true }));
    await handleAppHomeOpened({
      client: { views: { publish } },
      event: { tab: "messages", user: "U1" },
      logger: { error: vi.fn() },
    } as never);
    expect(publish).not.toHaveBeenCalled();
  });
});
