import type { WebClient } from "@slack/web-api";
import { findChannelForClient, findChannelIdByName, parseChannelRef } from "./channels.js";
import type { TranscriptQuality } from "./context.js";
import { stripSlackMarkup } from "./slack-markup.js";
import { expandMultilineMessages, slackTsToClock, type TranscriptLine } from "./transcript.js";
import { isSocialNoise, isDocumentWorthy } from "./text-signals.js";

export type ProposalSource =
  | {
      kind: "sales_channel";
      channelId: string;
      channelName: string;
      clientName: string;
      label: string;
    }
  | { kind: "unresolved"; message: string };

export type ProposalEvidenceSnippet = {
  label: string;
  text: string;
  url?: string;
};

export function parseClientName(text: string): string | undefined {
  const match = text.match(/\b(?:proposal|sow|quote)\s+for\s+([A-Za-z][\w-]*)/i);
  return match?.[1];
}

export function salesChannelName(clientSlug: string): string {
  return `sales-${clientSlug.toLowerCase().replace(/\s+/g, "-")}`;
}

export function resolveClientDisplayName(clientSlug: string, transcript: string): string {
  const titled = new RegExp(`\\b${clientSlug}\\s+Industries\\b`, "i");
  if (titled.test(transcript)) return `${clientSlug} Industries`;

  const bold = transcript.match(new RegExp(`\\*([^*]*${clientSlug}[^*]*)\\*`, "i"));
  if (bold?.[1]?.trim()) return bold[1].trim();

  return clientSlug;
}

function cleanTranscriptLine(raw: string): string | undefined {
  let text = stripSlackMarkup(raw.trim());
  text = text.replace(/^\d{1,2}:\d{2}\s+/, "");
  // Strip leading bullet/list markers pasted from Slack ("• ", "- ", "* ").
  text = text.replace(/^[•*\-–]\s+/, "");
  const speakerSplit = text.match(/^[^:]+:\s*(.+)$/);
  if (speakerSplit) text = speakerSplit[1].trim();
  text = text.replace(/<@[A-Z0-9]+>/g, "").trim();
  if (!text) return undefined;
  if (/^@forge\b/i.test(text)) return undefined;
  if (/\bno pricing\b/i.test(text)) return undefined;
  if (/^next:\s/i.test(text)) return undefined;
  if (/^open question:/i.test(text)) return undefined;
  if (isSocialNoise(text)) return undefined;
  return text;
}

function sentenceCase(text: string): string {
  const trimmed = text.trim().replace(/[.。]+$/, "");
  if (!trimmed) return trimmed;
  return `${trimmed[0]!.toUpperCase()}${trimmed.slice(1)}.`;
}

/**
 * Reduce rambling discovery prose to the deliverable. Keeps the first clause /
 * sentence (the actual need) and drops filler tails like "…the need for a
 * solution is becoming more pressing and timing is right" or a trailing second
 * sentence, so scope reads as work items, not transcript.
 */
function trimRequirementTail(text: string): string {
  let s = text.trim();
  // Keep only the first sentence.
  s = s.split(/(?<=[.!?])\s+/)[0] ?? s;
  // Cut common filler continuations. Word-boundaried so we never slice inside a
  // real token (e.g. the "so" must not match the "SO" in "SSO"). We do NOT cut
  // "that …" relative clauses — in "a solution that integrates with X", the
  // clause IS the deliverable.
  s = s.replace(
    /,?\s+(?:the need for\b.*$|and timing is right\b.*$|is becoming\b.*$|so\b(?: that)?\s.*$|because\b.*$)/i,
    "",
  );
  return s.replace(/[,;:\s]+$/, "").trim();
}

function normalizeRequirementKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(custom|admin|mandatory|before|go|live|near|real|time)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitScopeNotes(text: string): string[] {
  const match = text.match(/\bscope notes?:\s*(.+)$/i);
  if (!match?.[1]) return [];
  return match[1]
    .split(/,|\band\b/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 2)
    .map(sentenceCase);
}

function requirementFromLine(text: string): string | undefined {
  const scoped = splitScopeNotes(text);
  if (scoped.length > 0) return undefined;

  const afterDash = text.match(/—\s*(.+)$/)?.[1];
  if (afterDash && /\b(integration|discovery|kpi|dashboard|analytics)\b/i.test(afterDash)) {
    return sentenceCase(afterDash.replace(/\bdiscovery\b/gi, "").trim());
  }

  // "…the need to integrate X" / "they need a solution that …" → the core need.
  const needTo = text.match(/\bneed (?:to|for (?:a |an )?)\s*(.+)$/i)?.[1];
  if (needTo) return sentenceCase(trimRequirementTail(needTo));

  const need = text.match(/\bneeds?\s+(.+)$/i)?.[1];
  if (need) return sentenceCase(trimRequirementTail(need));

  const want = text.match(/\b(?:wants?|want)\s+(.+)$/i)?.[1];
  if (want) return sentenceCase(trimRequirementTail(want));

  const mandatory = text.match(/^(.+?)\s+is\s+mandatory\b/i)?.[1];
  if (mandatory) return sentenceCase(`${mandatory} before go-live`);

  if (/\b(api integration|kpi dashboards?|admin training|sso|okta|inventory sync)\b/i.test(text)) {
    return sentenceCase(text.replace(/^scope notes?:\s*/i, ""));
  }

  return undefined;
}

export function extractRequirementItems(transcript: string): string[] {
  const items: string[] = [];
  const seen = new Set<string>();

  for (const raw of transcript.split(/\r?\n/)) {
    const text = cleanTranscriptLine(raw);
    if (!text) continue;

    const candidates = splitScopeNotes(text);
    const primary = requirementFromLine(text);
    if (primary) candidates.unshift(primary);

    for (const candidate of candidates) {
      const scoped = toScopeItem(candidate);
      if (!scoped) continue;
      const key = normalizeRequirementKey(scoped);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(scoped);
    }
  }

  return items.slice(0, 6);
}

/**
 * Normalize a candidate into a scope deliverable, or reject it. Scope items are
 * statements of work — never questions ("can we set up a session?"), never
 * scheduling/logistics asides. Keep just the first sentence so we get a crisp
 * deliverable, not a paragraph.
 */
function toScopeItem(candidate: string): string | undefined {
  const first = candidate
    .trim()
    .split(/(?<=[.!?])\s+/)[0]
    .trim();
  if (!first) return undefined;
  // Reject questions — they're decisions/open items, not deliverables.
  if (/\?\s*$/.test(first) || /^(can|could|should|would|do|does|are|is|will)\b/i.test(first)) {
    return undefined;
  }
  // Reject scheduling/meeting asides that aren't work to deliver. Note "sync"
  // is only an aside as a meeting verb ("let's sync", "sync call/up") — NOT the
  // noun in "inventory sync", which is a real deliverable.
  if (
    /\b(working session|follow[- ]?up call|set up a (?:call|meeting|session)|let'?s sync|sync (?:up|call)|catch up)\b/i.test(
      first,
    )
  ) {
    return undefined;
  }
  // Reject reporting/meta phrasing ("Rahul mentioned…", "they said…", "let's
  // treat it as Tier 1") — that's context for the discovery notes, not a
  // deliverable.
  if (
    /\b(mentioned|noted|said|told us|let'?s treat|priority|go-live next|tied to a go-live)\b/i.test(
      first,
    )
  ) {
    return undefined;
  }
  const clean = sentenceCase(first);
  return clean.split(/\s+/).length >= 2 ? clean : undefined;
}

export function extractRequirements(transcript: string): string {
  const items = extractRequirementItems(transcript);
  if (items.length > 0) return items.join("\n");

  // No structured requirement matched. Rather than dump every raw line (which
  // pulls in social noise), keep only business-substantive sentences that also
  // pass the scope-item filter (no questions, no reporting/meta) — and if none
  // qualify, return empty so the mapper's grounded scope fallback applies.
  const fallback: string[] = [];
  for (const raw of transcript.split(/\r?\n/)) {
    const text = cleanTranscriptLine(raw);
    if (!text || !isBusinessSubstantive(text)) continue;
    const scoped = toScopeItem(text);
    if (scoped) fallback.push(scoped);
  }
  return fallback.slice(0, 6).join("\n");
}

/** A line worth putting in a proposal: real work substance, not chit-chat. */
function isBusinessSubstantive(text: string): boolean {
  return isDocumentWorthy(text);
}

export function inferProposalTimeline(transcript: string): Array<{
  phase: string;
  duration: string;
  deliverables: string;
}> {
  const weeks = transcript.match(/(?:~|about|around)?\s*(\d{1,2})\s*weeks?\b/i);
  const totalWeeks = weeks ? Number(weeks[1]) : 10;
  const buildWeeks = Math.max(2, totalWeeks - 4);

  return [
    {
      phase: "Discovery & design",
      duration: "2 weeks",
      deliverables: "Scope validation, integration map, delivery plan",
    },
    {
      phase: "Implementation",
      duration: `${buildWeeks} weeks`,
      deliverables: "Core integrations, KPI templates, QA sign-off",
    },
    {
      phase: "Rollout & enablement",
      duration: "2 weeks",
      deliverables: "Admin training, handoff, hypercare",
    },
  ];
}

export function proposalDiscoveryHighlights(transcript: string): string {
  const highlights: string[] = [];
  const seen = new Set<string>();
  for (const raw of transcript.split(/\r?\n/)) {
    const text = cleanTranscriptLine(raw);
    if (!text) continue;
    // Must read like discovery substance, not "want something" from a poll.
    const onTopic =
      /\b(kickoff|requirements?|mandatory|timeline|scope|training|credentials|data residency)\b/i.test(
        text,
      ) || isBusinessSubstantive(text);
    if (!onTopic) continue;
    const key = normalizeRequirementKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    highlights.push(`- ${sentenceCase(text)}`);
  }

  return highlights.slice(0, 8).join("\n");
}

export function proposalEvidenceSnippets(
  lines: TranscriptLine[],
  max = 3,
): ProposalEvidenceSnippet[] {
  const snippets: ProposalEvidenceSnippet[] = [];
  const seen = new Set<string>();

  for (const line of expandMultilineMessages(lines)) {
    const text = cleanTranscriptLine(line.text);
    if (!text) continue;
    if (!requirementFromLine(text) && !isBusinessSubstantive(text)) continue;

    const key = normalizeRequirementKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const clock = line.ts && line.ts !== "0" ? slackTsToClock(line.ts) : "";
    const source = line.channel ? `#${line.channel}` : line.speaker;
    const label = [source, clock].filter(Boolean).join(" ");
    snippets.push({
      label: label || "Slack source",
      text: sentenceCase(text).slice(0, 220),
      ...(line.permalink ? { url: line.permalink } : {}),
    });
    if (snippets.length >= max) break;
  }

  return snippets;
}

export async function resolveProposalSource(
  client: WebClient,
  commandText: string,
): Promise<ProposalSource> {
  const clientName = parseClientName(commandText);
  const ref = parseChannelRef(commandText);

  if (ref.channelId || ref.channelName) {
    const name = ref.channelName ?? ref.channelId!;
    const channelId =
      ref.channelId ??
      (ref.channelName ? await findChannelIdByName(client, ref.channelName) : undefined);
    if (!channelId) {
      return {
        kind: "unresolved",
        message: `I couldn't find ${ref.channelName ? `#${ref.channelName}` : "that channel"}. Invite @Forge there first.`,
      };
    }
    const slug = clientName ?? ref.channelName?.replace(/^sales-/, "") ?? "Client";
    return {
      kind: "sales_channel",
      channelId,
      channelName: ref.channelName ?? name,
      clientName: slug,
      label: ref.channelName ? `#${ref.channelName}` : `<#${channelId}>`,
    };
  }

  if (!clientName) {
    return {
      kind: "unresolved",
      message:
        "Tell me which client — e.g. `@forge proposal for Northstar`. " +
        "I'll find the channel about them, or you can point me at one: `… from #the-channel`.",
    };
  }

  // Find the channel that's actually about this client — no rigid
  // "#sales-<client>" convention. Matches "Omega" to "acct-omega", "sales-omega",
  // "omega-deal", etc.
  const matched = await findChannelForClient(client, clientName);
  if (!matched) {
    return {
      kind: "unresolved",
      message:
        `I couldn't find a channel about *${clientName}*. ` +
        "Point me at one directly — e.g. `@forge proposal for " +
        `${clientName} from #the-channel\` — or invite @Forge to it first.`,
    };
  }

  return {
    kind: "sales_channel",
    channelId: matched.id,
    channelName: matched.name,
    clientName,
    label: `#${matched.name}`,
  };
}

export function assessProposalTranscript(transcript: string): TranscriptQuality {
  const lineCount = transcript.split(/\r?\n/).filter(Boolean).length;
  const signals: string[] = [];

  if (lineCount >= 3) signals.push(`${lineCount} discovery lines`);
  if (
    /\b(scope|integration|discovery|kickoff|requirements?|timeline|sso|training)\b/i.test(
      transcript,
    )
  ) {
    signals.push("discovery language");
  }
  if (/\b(pricing|budget|\$\d)/i.test(transcript)) {
    signals.push("pricing mentioned");
  }

  if (lineCount < 2) {
    return {
      ok: false,
      reason: `Only ${lineCount} usable line(s) — I need more discovery context from the sales channel.`,
      signals,
      lineCount,
    };
  }

  if (
    !/\b(scope|integration|discovery|kickoff|requirements?|kpi|api|sso|training|timeline)\b/i.test(
      transcript,
    )
  ) {
    return {
      ok: false,
      reason:
        "This doesn't read like a discovery thread yet. Point me at the right account channel.",
      signals,
      lineCount,
    };
  }

  return { ok: true, signals, lineCount };
}
