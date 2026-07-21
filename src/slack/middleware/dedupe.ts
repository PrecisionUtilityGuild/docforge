import type { AnyMiddlewareArgs, Middleware } from "@slack/bolt";

/**
 * Drop Slack event redeliveries.
 *
 * Slack retries an event (up to 3×) when it does not see an HTTP 200 within ~3s.
 * Forge's listeners ack fast, but the *work* they kick off (gather → compile →
 * upload) is not idempotent — a redelivery would start a second workflow and
 * produce a duplicate PDF. Bolt surfaces the `X-Slack-Retry-Num` header as
 * `context.retryNum`; any value means "Slack already received this once."
 *
 * Belt-and-braces: we also keep a short-TTL set of seen event ids so duplicates
 * that arrive without a retry header (e.g. at-least-once delivery quirks) are
 * also dropped.
 */

const SEEN_TTL_MS = 5 * 60 * 1000;
const seen = new Map<string, number>();

function pruneSeen(now: number): void {
  for (const [id, ts] of seen) {
    if (now - ts > SEEN_TTL_MS) seen.delete(id);
  }
}

/** Stable identity for an inbound event envelope, for the seen-set. */
function eventKey(args: AnyMiddlewareArgs): string | undefined {
  const body = (args as { body?: Record<string, unknown> }).body;
  if (!body) return undefined;
  const eventId = body.event_id;
  if (typeof eventId === "string" && eventId) return `evt:${eventId}`;
  // Interactivity (actions/views) carry no event_id; key on trigger + user + ts.
  const triggerId = body.trigger_id;
  if (typeof triggerId === "string" && triggerId) return `trg:${triggerId}`;
  return undefined;
}

export const dedupeRedeliveries: Middleware<AnyMiddlewareArgs> = async (args) => {
  const { context, next } = args as AnyMiddlewareArgs & {
    context: { retryNum?: number };
    next: () => Promise<void>;
    logger?: { info?: (msg: string) => void };
  };

  // Primary guard: a retry header means Slack already delivered this once.
  if (typeof context.retryNum === "number" && context.retryNum > 0) {
    (args as { logger?: { info?: (m: string) => void } }).logger?.info?.(
      `dropping Slack redelivery (retryNum=${context.retryNum})`,
    );
    return; // do not call next() → listener never runs
  }

  // Secondary guard: explicit seen-set on event/trigger id.
  const now = Date.now();
  pruneSeen(now);
  const key = eventKey(args);
  if (key) {
    if (seen.has(key)) {
      (args as { logger?: { info?: (m: string) => void } }).logger?.info?.(
        `dropping duplicate event ${key}`,
      );
      return;
    }
    seen.set(key, now);
  }

  await next();
};

/** Test seam: clear the seen-set between cases. */
export function __resetDedupe(): void {
  seen.clear();
}
