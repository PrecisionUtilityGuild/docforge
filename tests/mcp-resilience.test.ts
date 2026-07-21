import { describe, expect, it, vi } from "vitest";
import { DocForgeMcpClient, McpUnavailableError } from "../src/forge/mcp-client.js";

/**
 * Drive the retry + circuit-breaker logic with a fake transport instead of a real
 * MCP child. The subclass overrides the single tool-invocation seam so we control
 * exactly which attempts throw a transport error vs. succeed, and stubs connect/
 * close so nothing spawns.
 */
class FakeMcpClient extends DocForgeMcpClient {
  invokeCount = 0;
  closeCount = 0;
  constructor(
    private readonly script: Array<"transport" | "tool" | "ok">,
    options?: ConstructorParameters<typeof DocForgeMcpClient>[1],
  ) {
    super("unused", options);
  }
  protected override async invokeTool(): Promise<unknown> {
    const step = this.script[Math.min(this.invokeCount, this.script.length - 1)];
    this.invokeCount += 1;
    if (step === "transport") throw new Error("connection closed");
    if (step === "tool") throw new Error("schema invalid");
    return { content: [{ type: "text", text: JSON.stringify({ status: "created" }) }] };
  }
  override async close(): Promise<void> {
    this.closeCount += 1;
  }
}

const ARGS = { template_id: "executive_memo", data: {} };

describe("MCP client resilience", () => {
  it("retries a transient transport failure and then succeeds", async () => {
    const client = new FakeMcpClient(["transport", "ok"], { backoffBaseMs: 1 });
    const res = await client.createDocument(ARGS);
    expect(res.status).toBe("created");
    expect(client.invokeCount).toBe(2);
    // Dropped the dead child before respawning for the retry.
    expect(client.closeCount).toBe(1);
  });

  it("does not retry a deterministic tool-level error", async () => {
    const client = new FakeMcpClient(["tool", "ok"], { backoffBaseMs: 1 });
    await expect(client.createDocument(ARGS)).rejects.toThrow(/schema invalid/);
    expect(client.invokeCount).toBe(1);
  });

  it("gives up after maxAttempts transport failures", async () => {
    const client = new FakeMcpClient(["transport", "transport", "transport", "ok"], {
      maxAttempts: 3,
      backoffBaseMs: 1,
      breakerThreshold: 99, // keep the breaker out of this test
    });
    await expect(client.createDocument(ARGS)).rejects.toThrow(/connection closed/);
    expect(client.invokeCount).toBe(3);
  });

  it("trips the breaker and then fails fast without invoking the child", async () => {
    const client = new FakeMcpClient(Array(20).fill("transport"), {
      maxAttempts: 1,
      backoffBaseMs: 1,
      breakerThreshold: 3,
      breakerCooldownMs: 10_000,
    });

    // Three single-attempt transport failures trip the breaker.
    for (let i = 0; i < 3; i++) {
      await expect(client.createDocument(ARGS)).rejects.toThrow(/connection closed/);
    }
    expect(client.breakerOpen).toBe(true);
    const invokesBeforeFastFail = client.invokeCount;

    // Next call fails fast (no child invocation) so producePdf can fall back.
    await expect(client.createDocument(ARGS)).rejects.toThrow(McpUnavailableError);
    expect(client.invokeCount).toBe(invokesBeforeFastFail);
  });

  it("half-opens after the cooldown and closes the breaker on a healthy probe", async () => {
    vi.useFakeTimers();
    try {
      const client = new FakeMcpClient(["transport", "transport", "transport", "ok"], {
        maxAttempts: 1,
        backoffBaseMs: 1,
        breakerThreshold: 3,
        breakerCooldownMs: 5_000,
      });

      for (let i = 0; i < 3; i++) {
        await expect(client.createDocument(ARGS)).rejects.toThrow(/connection closed/);
      }
      expect(client.breakerOpen).toBe(true);

      // After the cooldown the breaker half-opens and the next (healthy) call closes it.
      vi.advanceTimersByTime(5_001);
      expect(client.breakerOpen).toBe(false);
      const res = await client.createDocument(ARGS);
      expect(res.status).toBe("created");
    } finally {
      vi.useRealTimers();
    }
  });
});
