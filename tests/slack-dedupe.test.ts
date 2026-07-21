import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetDedupe, dedupeRedeliveries } from "../src/slack/middleware/dedupe.js";

type Args = Record<string, unknown> & { next: () => Promise<void> };

function run(args: Partial<Args>) {
  const next = vi.fn(async () => {});
  const full = {
    context: {},
    body: {},
    logger: { info: () => {} },
    ...args,
    next,
  } as unknown as Parameters<typeof dedupeRedeliveries>[0];
  return { promise: dedupeRedeliveries(full), next };
}

describe("dedupeRedeliveries (F4)", () => {
  beforeEach(() => __resetDedupe());

  it("passes a first-delivery event through to the listener", async () => {
    const { promise, next } = run({ body: { event_id: "Ev1" } });
    await promise;
    expect(next).toHaveBeenCalledOnce();
  });

  it("drops events carrying a Slack retry header (retryNum > 0)", async () => {
    const { promise, next } = run({ context: { retryNum: 1 }, body: { event_id: "Ev2" } });
    await promise;
    expect(next).not.toHaveBeenCalled();
  });

  it("drops a duplicate event_id even without a retry header", async () => {
    await run({ body: { event_id: "EvDup" } }).promise;
    const second = run({ body: { event_id: "EvDup" } });
    await second.promise;
    expect(second.next).not.toHaveBeenCalled();
  });

  it("keys interactivity payloads on trigger_id", async () => {
    await run({ body: { trigger_id: "T-1" } }).promise;
    const second = run({ body: { trigger_id: "T-1" } });
    await second.promise;
    expect(second.next).not.toHaveBeenCalled();
  });
});
