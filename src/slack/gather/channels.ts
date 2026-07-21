import type { WebClient } from "@slack/web-api";

export type ChannelRef = {
  channelId?: string;
  channelName?: string;
};

export type ResolvedChannel = {
  id: string;
  name?: string;
};

export function parseChannelRef(text: string): ChannelRef {
  const link = text.match(/<#([A-Z0-9]+)(?:\|([^>]+))?>/i);
  if (link) {
    return { channelId: link[1], channelName: link[2]?.toLowerCase() };
  }

  const hash = text.match(/#([a-z0-9][a-z0-9_-]*)/i);
  if (hash) {
    return { channelName: hash[1].toLowerCase() };
  }

  return {};
}

async function listAllChannels(client: WebClient): Promise<Array<{ id?: string; name?: string }>> {
  const channels: Array<{ id?: string; name?: string }> = [];
  let cursor: string | undefined;
  do {
    const page = await client.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    for (const c of page.channels ?? []) channels.push({ id: c.id, name: c.name });
    cursor = page.response_metadata?.next_cursor;
  } while (cursor);
  return channels;
}

export async function findChannelIdByName(
  client: WebClient,
  name: string,
): Promise<string | undefined> {
  const channels = await listAllChannels(client);
  return channels.find((c) => c.name === name)?.id;
}

/**
 * Find the channel that's actually about a client, without assuming a rigid
 * "#sales-<client>" naming convention. Matches the client name as a token
 * anywhere in a channel name (so "Omega" finds "acct-omega", "sales-omega",
 * "omega-deal", …). Prefers conventional deal-channel prefixes, then the
 * shortest/most-specific name, so "omega" picks "acct-omega" over a noisy
 * "general-omega-watercooler".
 */
export async function findChannelForClient(
  client: WebClient,
  clientName: string,
): Promise<{ id: string; name: string } | undefined> {
  const needle = clientName.toLowerCase().replace(/\s+/g, "-");
  const channels = await listAllChannels(client);

  const scored = channels
    .filter((c): c is { id: string; name: string } => Boolean(c.id && c.name))
    .map((c) => {
      const name = c.name.toLowerCase();
      // Whole-token match: needle bounded by start/end or a separator.
      const tokenRe = new RegExp(`(^|[-_])${escapeForRegex(needle)}([-_]|$)`);
      if (!tokenRe.test(name)) return undefined;
      const prefixed = /^(sales|acct|account|deal|proposal|prospect|client)[-_]/.test(name);
      // Lower score = better. Prefer a deal-prefix, then a shorter name.
      return { c, score: (prefixed ? 0 : 100) + name.length };
    })
    .filter((x): x is { c: { id: string; name: string }; score: number } => Boolean(x))
    .sort((a, b) => a.score - b.score);

  return scored[0]?.c;
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function channelNameToIncidentId(name: string): string | undefined {
  const incident = name.match(/incident[-_]?(\d+)/i);
  if (incident) return `INC-${incident[1].padStart(3, "0")}`;

  const digits = name.match(/(\d{2,})/);
  if (digits) return `INC-${digits[1].padStart(3, "0")}`;

  return undefined;
}

export function incidentPdfFilename(channelName?: string): string {
  const id = channelName ? channelNameToIncidentId(channelName) : undefined;
  return id ? `${id}-Report.pdf` : "Incident-Report.pdf";
}

export function proposalPdfFilename(clientName: string): string {
  const slug = clientName.replace(/\s+/g, "-");
  return `${slug}-Proposal.pdf`;
}
