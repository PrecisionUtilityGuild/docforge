import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadSlackTextFile } from "../src/slack/gather/files.js";

const client = {} as Parameters<typeof downloadSlackTextFile>[0];

function mockFetch(body: string, headers: Record<string, string> = {}) {
  return vi.fn(
    async () =>
      new Response(body, {
        status: 200,
        headers: { "content-length": String(Buffer.byteLength(body)), ...headers },
      }),
  );
}

describe("downloadSlackTextFile host pin + size cap (F6/F7)", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
    vi.stubEnv("DOCFORGE_MAX_CSV_BYTES", String(64));
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("downloads from a slack.com host and returns text", async () => {
    globalThis.fetch = mockFetch("metric,value\nARR,1") as typeof fetch;
    const out = await downloadSlackTextFile(client, {
      url_private_download: "https://files.slack.com/files-pri/T1-F1/data.csv",
    });
    expect(out).toContain("metric,value");
  });

  it("refuses a non-Slack host (no token leak)", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    await expect(
      downloadSlackTextFile(client, {
        url_private_download: "https://evil.example.com/files-pri/x/data.csv",
      }),
    ).rejects.toThrow(/non-Slack host/i);
    expect(spy).not.toHaveBeenCalled(); // token never sent
  });

  it("refuses non-https Slack URLs", async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    await expect(
      downloadSlackTextFile(client, {
        url_private_download: "http://files.slack.com/x/data.csv",
      }),
    ).rejects.toThrow(/https/i);
  });

  it("rejects an oversized file via Content-Length", async () => {
    const big = "x".repeat(200);
    globalThis.fetch = mockFetch(big) as typeof fetch;
    await expect(
      downloadSlackTextFile(client, {
        url_private_download: "https://files.slack.com/x/big.csv",
      }),
    ).rejects.toThrow(/exceeds/i);
  });

  it("rejects an oversized file even when Content-Length lies (streaming cap)", async () => {
    const big = "y".repeat(200);
    globalThis.fetch = mockFetch(big, { "content-length": "10" }) as typeof fetch;
    await expect(
      downloadSlackTextFile(client, {
        url_private_download: "https://files.slack.com/x/liar.csv",
      }),
    ).rejects.toThrow(/exceeds/i);
  });
});
