import { stat } from "node:fs/promises";
import { vi } from "vitest";
import type { WebClient } from "@slack/web-api";
import type { ForgeMessageContext, SayFn } from "../../src/slack/types.js";

/**
 * A record-everything fake of the slice of the Slack WebClient the Forge agent
 * actually calls. It lets the e2e harness drive the whole message→confirm→upload
 * loop without a live workspace while asserting on observable side effects
 * (status lines, the confirm card, the uploaded PDF). `files.uploadV2` reads the
 * real PDF path so a broken/empty PDF surfaces as a test failure, not a mock.
 */
export type FakeSlack = {
  client: WebClient;
  say: SayFn;
  /** Every chat.postMessage / say() payload, in order. */
  messages: Record<string, unknown>[];
  /** Every assistant thread status line set, in order. */
  statuses: string[];
  /** Every assistant thread title set, in order. */
  titles: string[];
  /** Every files.uploadV2 call with the real byte size read off disk. */
  uploads: { filename: string; initialComment?: string; bytes: number }[];
};

/** Seed messages a channel's conversations.history will return (status/incident gather). */
export function createFakeSlack(channelMessages: string[] = []): FakeSlack {
  const messages: Record<string, unknown>[] = [];
  const seeded = channelMessages.map((text, i) => ({
    type: "message" as const,
    user: `U${i}`,
    text,
    ts: `${1700000000 + i}.0000`,
  }));
  const statuses: string[] = [];
  const titles: string[] = [];
  const uploads: FakeSlack["uploads"] = [];

  const say: SayFn = async (args) => {
    messages.push(args as Record<string, unknown>);
    return { ok: true, ts: `${Date.now()}.000` };
  };

  const client = {
    chat: {
      postMessage: vi.fn(async (args: Record<string, unknown>) => {
        messages.push(args);
        return { ok: true, ts: `${Date.now()}.000` };
      }),
    },
    assistant: {
      threads: {
        setStatus: vi.fn(async (args: { status: string }) => {
          statuses.push(args.status);
          return { ok: true };
        }),
        setTitle: vi.fn(async (args: { title: string }) => {
          titles.push(args.title);
          return { ok: true };
        }),
        setSuggestedPrompts: vi.fn(async () => ({ ok: true })),
      },
    },
    files: {
      uploadV2: vi.fn(
        async (args: { filename: string; file: unknown; initial_comment?: string }) => {
          // Read the real file the agent handed us so a 0-byte / missing PDF fails.
          const stream = args.file as { path?: string };
          const bytes = stream?.path ? (await stat(stream.path)).size : 0;
          uploads.push({
            filename: args.filename,
            initialComment: args.initial_comment,
            bytes,
          });
          return { ok: true, files: [{ id: `F${uploads.length}` }] };
        },
      ),
    },
    conversations: {
      history: vi.fn(async () => ({ ok: true, messages: seeded })),
      replies: vi.fn(async () => ({ ok: true, messages: [] })),
      info: vi.fn(async () => ({ ok: true, channel: { id: "C_TEST", name: "team-eng" } })),
    },
    users: {
      info: vi.fn(async () => ({ ok: true, user: { real_name: "Tester", name: "tester" } })),
    },
  } as unknown as WebClient;

  return { client, say, messages, statuses, titles, uploads };
}

/** Build a ForgeMessageContext wired to a FakeSlack for a channel @mention. */
export function fakeContext(
  fake: FakeSlack,
  text: string,
  overrides: Partial<ForgeMessageContext> = {},
): ForgeMessageContext {
  return {
    text,
    threadTs: "1700000000.000100",
    replyChannelId: "C_TEST",
    isDm: false,
    inThread: false,
    say: fake.say,
    client: fake.client,
    setStatus: async (args) => {
      fake.statuses.push(args.status);
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as ForgeMessageContext["logger"],
    ...overrides,
  };
}
