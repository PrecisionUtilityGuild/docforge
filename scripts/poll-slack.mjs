#!/usr/bin/env node
/**
 * Read-only workspace poll: list channels + recent messages the bot can see.
 *
 *   npm run poll:slack
 *   npm run poll:slack -- --channel campaign-nto
 *   npm run poll:slack -- --json > workspace-dump.json
 *
 * Bot must be /invite'd to private channels. Public channels need bot in channel
 * for history (or channel membership).
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { WebClient } from "@slack/web-api";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const channelFilter = args.includes("--channel") ? args[args.indexOf("--channel") + 1] : undefined;
const limit = Number(process.env.POLL_MESSAGE_LIMIT ?? 30);
const outFile = process.env.POLL_OUTPUT;

export async function listChannels(client) {
  const channels = [];
  let cursor;
  do {
    const page = await client.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    for (const ch of page.channels ?? []) {
      if (ch.id && ch.name) {
        channels.push({
          id: ch.id,
          name: ch.name,
          is_private: ch.is_private ?? false,
          num_members: ch.num_members,
          topic: ch.topic?.value,
          purpose: ch.purpose?.value,
        });
      }
    }
    cursor = page.response_metadata?.next_cursor;
  } while (cursor);
  return channels;
}

export async function fetchHistory(client, channelId) {
  try {
    const res = await client.conversations.history({
      channel: channelId,
      limit,
    });
    const messages = (res.messages ?? [])
      .map((m) => ({
        ts: m.ts,
        user: m.user,
        text: m.text,
        subtype: m.subtype,
        reply_count: m.reply_count,
      }))
      .reverse();
    return { ok: true, messages };
  } catch (err) {
    return {
      ok: false,
      error: err?.data?.error ?? err.message,
      messages: [],
    };
  }
}

export function normalizeChannelFilter(value) {
  return value?.replace(/^#/, "");
}

export function applyChannelFilter(channels, filter) {
  const normalized = normalizeChannelFilter(filter);
  if (!normalized) return channels;
  return channels.filter((c) => c.name === normalized);
}

export function formatTranscript(messages) {
  return messages
    .filter((m) => m.text?.trim())
    .map((m) => m.text.trim())
    .join("\n");
}

async function main() {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    console.error("SLACK_BOT_TOKEN missing — add to .env");
    process.exit(1);
  }

  const client = new WebClient(token);
  const auth = await client.auth.test();
  const workspace = {
    team: auth.team,
    team_id: auth.team_id,
    bot_user: auth.user,
    polled_at: new Date().toISOString(),
  };

  let channels = await listChannels(client);
  if (channelFilter) {
    channels = applyChannelFilter(channels, channelFilter);
    if (channels.length === 0) {
      console.error(`Channel not found: ${channelFilter}`);
      process.exit(1);
    }
  }

  const report = { workspace, channels: [] };

  for (const ch of channels) {
    const history = await fetchHistory(client, ch.id);
    const entry = {
      ...ch,
      accessible: history.ok,
      error: history.error,
      message_count: history.messages.length,
      messages: history.messages,
      transcript: formatTranscript(history.messages),
    };
    report.channels.push(entry);
  }

  if (jsonOut) {
    const text = JSON.stringify(report, null, 2);
    if (outFile) {
      await writeFile(outFile, text, "utf8");
      console.error(`Wrote ${outFile}`);
    } else {
      console.log(text);
    }
    return;
  }

  console.log(`Workspace: ${workspace.team} (${workspace.team_id})`);
  console.log(`Bot: ${workspace.bot_user}`);
  console.log(`Channels: ${report.channels.length}\n`);

  for (const ch of report.channels) {
    const status = ch.accessible ? `${ch.message_count} msgs` : `✗ ${ch.error}`;
    console.log(`#${ch.name} (${ch.id}) — ${status}`);
    if (ch.accessible && ch.message_count > 0) {
      const preview = ch.transcript.split("\n").slice(0, 3).join("\n  ");
      console.log(`  preview:\n  ${preview}${ch.message_count > 3 ? "\n  …" : ""}`);
    }
    console.log();
  }

  const inaccessible = report.channels.filter((c) => !c.accessible);
  if (inaccessible.length) {
    console.log("Tip: /invite @Forge to channels you want to read (not_in_channel).");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("poll failed:", err?.data?.error ?? err.message ?? err);
    process.exit(1);
  });
}
