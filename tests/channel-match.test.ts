import { describe, expect, it } from "vitest";
import { findChannelForClient } from "../src/slack/gather/channels.js";

function stubClient(names: string[]) {
  return {
    conversations: {
      list: async () => ({
        channels: names.map((name, i) => ({ id: `C${i}`, name })),
        response_metadata: {},
      }),
    },
  } as unknown as Parameters<typeof findChannelForClient>[0];
}

const channelNames = [
  "general",
  "acct-omega",
  "acct-edge",
  "campaign-nto",
  "service-swarm",
  "random",
];

describe("findChannelForClient — no rigid #sales-<client> convention", () => {
  it("finds the client channel regardless of prefix (acct-omega, not sales-omega)", async () => {
    expect((await findChannelForClient(stubClient(channelNames), "Omega"))?.name).toBe(
      "acct-omega",
    );
    expect((await findChannelForClient(stubClient(channelNames), "Edge"))?.name).toBe("acct-edge");
  });

  it("is case-insensitive", async () => {
    expect((await findChannelForClient(stubClient(channelNames), "omega"))?.name).toBe(
      "acct-omega",
    );
  });

  it("returns undefined (honest miss) when no channel mentions the client", async () => {
    expect(await findChannelForClient(stubClient(channelNames), "Northstar")).toBeUndefined();
  });

  it("prefers a deal-prefixed channel over an incidental token match", async () => {
    const names = ["random-omega-banter", "sales-omega", "omega"];
    expect((await findChannelForClient(stubClient(names), "Omega"))?.name).toBe("sales-omega");
  });

  it("matches whole tokens only — 'edge' does not match 'knowledge-base'", async () => {
    expect(await findChannelForClient(stubClient(["knowledge-base"]), "edge")).toBeUndefined();
  });
});
