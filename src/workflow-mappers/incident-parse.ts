export type TimelineEntry = { time: string; event: string };

const EMBEDDED_TIME = /^(\d{1,2}:\d{2})\s+(.+)$/;

export function parseTimelineLine(line: string, index: number): TimelineEntry {
  const trimmed = line.trim();

  const slackWrapped = trimmed.match(/^(\d{1,2}:\d{2})\s+[^:\n]+:\s+(\d{1,2}:\d{2}\s+.+)$/);
  if (slackWrapped) {
    return parseTimelineLine(slackWrapped[2], index);
  }

  const embedded = trimmed.match(EMBEDDED_TIME);
  if (embedded) {
    return { time: embedded[1], event: embedded[2].trim() };
  }

  const slackClock = trimmed.match(/^(\d{1,2}:\d{2})\s+([^:]+):\s*(.+)$/);
  if (slackClock) {
    return { time: slackClock[1], event: `${slackClock[2].trim()}: ${slackClock[3].trim()}` };
  }

  return { time: `T+${index * 5}m`, event: trimmed };
}

export function inferSeverity(transcript: string): "low" | "medium" | "high" | "critical" {
  const lower = transcript.toLowerCase();
  if (/\b(sev[- ]?0|severity:\s*critical|p0)\b/.test(lower)) return "critical";
  if (/\b(sev[- ]?1|severity:\s*high|p1)\b/.test(lower)) return "high";
  if (/\b(sev[- ]?2|severity:\s*medium|p2)\b/.test(lower)) return "medium";
  if (/\b(sev[- ]?3|severity:\s*low|p3)\b/.test(lower)) return "low";
  if (/\berror rate\b|\boutage\b|\bdegrad|\bincident bridge\b/.test(lower)) return "high";
  if (/\ball clear\b|\bresolved\b|\brestored\b/.test(lower)) return "medium";
  // No severity signal stated in the channel — do not stamp "high" on an
  // incident the transcript never characterized. "medium" is the honest neutral
  // default; the human sets the real severity at the confirm step.
  return "medium";
}

export function extractRootCause(transcript: string): string | undefined {
  // Explicit declarations first — these are stated as the root cause.
  const explicit = [
    /root cause\s*(?:likely|was|is|:)\s*([^\n.]+)/i,
    /identified\s+(?:the\s+)?root cause[:\s]+([^\n.]+)/i,
    /(?:caused by|due to|because of)\s+([^\n.]+)/i,
  ];
  for (const pattern of explicit) {
    const m = transcript.match(pattern);
    if (m?.[1]) return cleanCause(m[1]);
  }

  // Hypotheses stated tentatively ("looks like there's an OAuth handshake
  // issue…"). We surface these as the *suspected* cause — never asserting
  // certainty the channel didn't (isRootCauseConfirmed stays false for these,
  // so the report frames it as unconfirmed).
  const hypothesis = transcript.match(
    /(?:looks like|appears to be|seems? (?:to be|like)|likely|probably|suspect(?:ed)?(?: that)?)\s+(?:it'?s\s+|there'?s\s+(?:an?\s+)?|an?\s+)?([^\n.]+)/i,
  );
  if (hypothesis?.[1]) {
    const cause = cleanCause(hypothesis[1]);
    if (cause && cause.length >= 6) return `Suspected: ${cause}`;
  }
  return undefined;
}

/** Tidy a captured cause phrase: trim filler tail, drop trailing punctuation. */
function cleanCause(raw: string): string {
  return raw
    .trim()
    .replace(/\s+(?:and|plus|—|-)\s+i'?ll\b.*$/i, "") // drop "… and I'll take the lead"
    .replace(/[.,;:]+$/, "")
    .trim();
}

export function isRootCauseConfirmed(transcript: string): boolean {
  const lower = transcript.toLowerCase();
  if (/\broot cause\s+confirmed\b/.test(lower) || /\bconfirmed root cause\b/.test(lower)) {
    return true;
  }
  if (/\broot cause\b/.test(lower) && /\blikely\b/.test(lower)) {
    return false;
  }
  if (/\broot cause\b/.test(lower) && /\b(identified as|determined to be|was|is)\b/.test(lower)) {
    return true;
  }
  return false;
}

export function durationFromTimelineLines(lines: string[]): string | undefined {
  const minutes: number[] = [];
  for (const line of lines) {
    const match = line.match(/^(\d{1,2}):(\d{2})/);
    if (!match) continue;
    minutes.push(Number(match[1]) * 60 + Number(match[2]));
  }
  if (minutes.length < 2) return undefined;
  const span = minutes[minutes.length - 1] - minutes[0];
  return span > 0 ? `${span} minutes` : undefined;
}

export function extractDuration(transcript: string, timelineLines: string[]): string {
  const explicit = transcript.match(/(\d+)\s*(?:min(?:utes)?|m)\b/i);
  if (explicit) return `${explicit[1]} minutes`;
  return durationFromTimelineLines(timelineLines) ?? "Unknown";
}

export function extractUsersAffected(transcript: string): string | undefined {
  // Preserve what the channel actually stated. If the transcript already names
  // what the percentage is *of* ("45% of checkout sessions"), quote that phrase
  // verbatim rather than relabeling it as an "estimate" or swapping in our own
  // "active sessions" framing.
  const phrased = transcript.match(/(\d+(?:\.\d+)?%\s+of\s+[\w-]+(?:\s+[\w-]+){0,2})/i);
  if (phrased?.[1]) {
    // Trim trailing verb/clause tokens so we keep just the noun phrase
    // ("45% of checkout sessions"), not "…sessions saw errors".
    return phrased[1]
      .replace(
        /\s+(?:saw|had|were|was|experienced|reported|affected|impacted|seeing|hit|got)\b.*$/i,
        "",
      )
      .trim();
  }
  const pctOnly = transcript.match(/(\d+(?:\.\d+)?%)\s+.*\bsessions?\b/i);
  return pctOnly?.[1] ? `${pctOnly[1]} of sessions` : undefined;
}

/**
 * Extract service names that genuinely appear in the transcript — no hardcoded
 * allowlist. Catches common naming shapes (`checkout-service`, `api-gateway`,
 * `payment-api`, `*-svc`, `backtick-quoted` names) so real incidents about any
 * service are captured, not just the four we happened to anticipate.
 */
export function extractServices(transcript: string): string[] {
  const found = new Map<string, string>(); // lowercase key -> display form
  const add = (raw: string) => {
    const cleaned = raw.trim().replace(/[`"']/g, "");
    if (cleaned.length < 2) return;
    const key = cleaned.toLowerCase();
    if (!found.has(key)) found.set(key, cleaned);
  };

  // 1. Hyphenated service-ish identifiers: foo-service, api-gateway, payment-api, x-svc, y-db
  for (const m of transcript.matchAll(
    /\b([a-z][a-z0-9]*(?:-[a-z0-9]+)*-(?:service|svc|gateway|api|db|queue|worker|proxy|cache))\b/gi,
  )) {
    add(m[1]);
  }
  // 2. "<word> service/provider/..." — only a single preceding capitalized-or-lower
  //    noun token (not a whole clause), to avoid swallowing sentences.
  for (const m of transcript.matchAll(
    /\b([a-z][a-z0-9]{2,20})\s+(service|provider|database|queue|cluster)\b/gi,
  )) {
    const head = m[1].toLowerCase();
    // Skip filler/verbs that aren't service names.
    if (
      ["the", "a", "our", "their", "this", "that", "will", "to", "add", "with", "on"].includes(head)
    ) {
      continue;
    }
    add(`${m[1].trim()} ${m[2].toLowerCase()}`);
  }
  // 3. Backtick-quoted identifiers (common in eng channels)
  for (const m of transcript.matchAll(/`([a-z][a-z0-9._-]{2,40})`/gi)) {
    add(m[1]);
  }
  // 4. Named integrations/products: a short run of Capitalized/UPPER tokens that
  //    ends in a system noun — "MuleSoft SAP Connector", "Payments Gateway",
  //    "Billing Pipeline". Bounded to 1–3 leading tokens so we capture the
  //    product name, not the surrounding sentence.
  for (const m of transcript.matchAll(
    /\b((?:[A-Z][A-Za-z0-9]+|[A-Z]{2,})(?:\s+(?:[A-Z][A-Za-z0-9]+|[A-Z]{2,})){0,2}\s+(?:Connector|Integration|Gateway|Platform|Pipeline|Service|Connector|API|Bridge|Sync))\b/g,
  )) {
    add(m[1]);
  }

  return [...found.values()]
    .map((s) =>
      s
        .split(/\s+/)
        // Preserve existing all-caps acronyms (SAP, API, IDoc-style); otherwise
        // title-case each word, including after hyphens (checkout-service →
        // Checkout-Service).
        .map((w) => (/^[A-Z0-9]+$/.test(w) ? w : w.replace(/\b\w/g, (c) => c.toUpperCase())))
        .join(" ")
        .replace(/\bApi\b/g, "API"),
    )
    .slice(0, 6);
}

export function inferSummary(transcript: string, timeline: TimelineEntry[]): string {
  // Only claim resolution if the transcript actually shows it — never assert
  // "service was restored" on an incident that may still be ongoing.
  const resolved = /\b(all clear|resolved|restored|recovered|mitigated|back to normal)\b/i.test(
    transcript,
  );
  const closing = resolved
    ? "On-call engaged; the channel timeline indicates the incident was resolved."
    : "On-call engaged; resolution status is not confirmed in the channel timeline.";

  const opener = timeline.find((entry) =>
    /\berror|outage|degrad|incident|pager\b/i.test(entry.event),
  );
  if (opener) {
    return `Incident tracked in Slack beginning at ${opener.time}: ${opener.event}. ${closing}`;
  }
  const first = timeline[0]?.event;
  if (first) {
    return `Incident tracked in Slack. First noted event: ${first}. ${closing}`;
  }
  return "Production incident documented from Slack channel transcript.";
}

export type IncidentAction = {
  title: string;
  owner: string;
  due: string;
  status: "open" | "in_progress" | "done";
};

const ACTION_DUE_UNSET = "Confirm before final approval";
const ACTION_OWNER_UNSET = "Incident lead";

// Words that look like an owner token but are really verbs/fillers in
// "failing over to…", "rolling back to…" etc. Never treat as an owner.
const VERB_OWNERS = new Set([
  "over",
  "back",
  "failing",
  "rolling",
  "moving",
  "switching",
  "going",
  "trying",
  "we",
  "they",
  "i",
]);

/** Normalize a captured owner token: keep @mentions/names, default if absent. */
function normalizeOwner(raw: string | undefined): string {
  if (!raw) return ACTION_OWNER_UNSET;
  const cleaned = raw
    .trim()
    .replace(/^@/, "")
    .replace(/[:,.]$/, "");
  return cleaned.length >= 2 ? cleaned.replace(/\b\w/, (c) => c.toUpperCase()) : ACTION_OWNER_UNSET;
}

/** Trim a captured action phrase to a clean, single-line title. */
function cleanActionTitle(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "")
    .replace(/^(to|will|should|needs? to|going to)\s+/i, "")
    .replace(/\b\w/, (c) => c.toUpperCase());
}

/**
 * Extract action items that were ACTUALLY stated in the transcript — never
 * invented. We do not fabricate owners or due dates: an owner is only set if a
 * person/@mention is named, and the due date stays explicit about needing human
 * confirmation. Returns [] when no follow-ups were stated, so the
 * confirm step can prompt rather than the code hallucinating tasks.
 */
export function inferActions(transcript: string): IncidentAction[] {
  const actions: IncidentAction[] = [];
  const seen = new Set<string>();
  const push = (title: string, owner: string, status: IncidentAction["status"]) => {
    const t = cleanActionTitle(title);
    if (t.length < 4) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    actions.push({ title: t, owner, due: ACTION_DUE_UNSET, status });
  };

  for (const rawLine of transcript.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // "action item: X" / "AI: X" / "follow-up: X" / "todo: X"
    const labelled = line.match(
      /\b(?:action item|action|follow[- ]?up|todo|next step)s?\s*[:-]\s*(.+)$/i,
    );
    if (labelled) {
      push(labelled[1], ACTION_OWNER_UNSET, "open");
      continue;
    }

    // Owner commitment. An @mention is an unambiguous owner signal, so match it
    // anywhere ("…recovered. @maria will follow up"). A bare name must be at the
    // start of the statement so we don't capture the "over" in "failing over to…".
    const body = line.replace(/^\d{1,2}:\d{2}\s*/, "").replace(/^[^:]{1,24}:\s*/, "");
    const mention = body.match(
      /(@[a-z][\w.-]{1,30})\s+(?:will|is going to|to|should|needs? to|agreed to)\s+(.+)$/i,
    );
    const named = body.match(
      /^([A-Z][a-z]+)\s+(?:will|is going to|to|should|needs? to|agreed to)\s+(.+)$/,
    );
    const commit = mention ?? named;
    if (commit && !VERB_OWNERS.has(commit[1].toLowerCase().replace(/^@/, ""))) {
      push(commit[2], normalizeOwner(commit[1]), "open");
      continue;
    }

    // Plain "need to X" / "we should X" with no named owner
    const unowned = line.match(/\b(?:we\s+)?(?:need to|should|must|plan to)\s+(.+)$/i);
    if (unowned) {
      push(unowned[1], ACTION_OWNER_UNSET, "open");
    }
  }

  return actions;
}
