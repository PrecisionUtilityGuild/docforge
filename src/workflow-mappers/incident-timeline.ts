import type { TimelineEntry } from "./incident-parse.js";
import { isSocialNoise } from "../slack/gather/text-signals.js";

/**
 * Distill a raw message timeline into the events that materially advanced an
 * incident, the way a human SRE writes a postmortem timeline — not a verbatim
 * paste of every chat line.
 *
 * Each message is classified into an incident phase (detection, diagnosis,
 * escalation, mitigation, recovery, action). Only phase-bearing messages are
 * kept; social chatter ("great teamwork", "team lunch") is dropped from the
 * timeline. The full transcript still lives in the report's Evidence section —
 * that is the audit trail; the timeline is the narrative.
 */

export type IncidentPhase =
  | "detection"
  | "diagnosis"
  | "escalation"
  | "mitigation"
  | "recovery"
  | "action";

type PhaseRule = { phase: IncidentPhase; test: RegExp; label: (m: RegExpMatchArray) => string };

// Order matters: recovery/mitigation outrank diagnosis when a line has both.
const PHASE_RULES: PhaseRule[] = [
  {
    phase: "recovery",
    test: /\b(all clear|resolved|restored|recovered|back to normal|mitigated|service restored)\b/i,
    label: () => "Incident mitigated / service recovered",
  },
  {
    phase: "mitigation",
    test: /\b(rollback|rolled back|roll back|failover|failed over|restart|redeploy|hotfix|patch|disabled|scaled up|scaling up|reverted)\b/i,
    label: (m) => `Mitigation: ${m[1].toLowerCase()}`,
  },
  {
    phase: "detection",
    test: /\b(pager|paged|alert|alarm|error rate|errors? (?:spiking|climbing|elevated)|outage|down|5\d\ds?|timeouts?|degrad\w*|opened? (?:a )?(?:ticket|case|incident)|raised? (?:a )?(?:ticket|case)|reported|blocked on|reported by)\b/i,
    label: () => "Detection: issue reported",
  },
  {
    phase: "diagnosis",
    test: /\b(root cause|caused by|because of|due to|investigat\w+|looks like|appears to be|identified|oauth|handshake|connection pool|memory|cpu|deadlock|exhaust\w*|misconfigur\w*|mapping|config\w*)\b/i,
    label: () => "Diagnosis / investigation",
  },
  {
    phase: "escalation",
    test: /\b(tier ?[12]|sev[- ]?\d|p[0-3]\b|escalat\w+|incident bridge|war ?room|paging|on[- ]?call|priority)\b/i,
    label: () => "Escalation / prioritization",
  },
  {
    phase: "action",
    test: /\b(action item|follow[- ]?up|next step|todo|will (?:document|prepare|coordinate|send|review|confirm|schedule)|working session|post[- ]?session)\b/i,
    label: () => "Follow-up / next step agreed",
  },
];

/** Tidy a sentence into a timeline event: strip social filler, trim. */
function tidy(sentence: string): string {
  const s = sentence
    .trim()
    // Strip leading social interjections ("Perfect — ", "Thanks, Steven. ",
    // "Great teamwork. ", "Good call. ") that precede the real content.
    .replace(
      /^(?:perfect|thanks?|great(?: teamwork)?|good call|appreciate it|sounds good|got it|sure|okay|ok|yep|yes|np|cool)\b[\s,!—.-]*(?:[A-Z][a-z]+[\s,!—.-]*)?/i,
      "",
    )
    // Drop self-assignment tails that aren't part of the event itself.
    .replace(/\.\s+I(?:'?ll| can| will| also)\b.*$/i, "")
    .replace(/[.,;:\s—-]+$/, "")
    .trim();
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Describe an event using the sentence that actually carries the signal we
 * classified on — not blindly the first sentence (which is often social
 * preamble like "Just read through the case." before the real "Looks like
 * there's an OAuth handshake issue…"). Falls back to the phase label.
 */
function eventDescription(
  rawEvent: string,
  signal: string,
  label: string,
  preferLead = false,
): string {
  const body = rawEvent.replace(/^@?[\w .-]{1,30}:\s*/, "").trim();
  const sentences = body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const carrierSentence = sentences.find(
    (s) => signal && new RegExp(escapeRe(signal), "i").test(s),
  );
  // Detection / opener: the lead sentence names the incident ("Rahul opened a
  // ticket for the MuleSoft SAP Connector"), so prefer it over a later
  // signal-bearing clause like "He's blocked on…".
  const carrier =
    (preferLead ? sentences[0] : carrierSentence) ?? carrierSentence ?? sentences[0] ?? body;
  const tidied = tidy(carrier);
  if (tidied.length === 0 || tidied.length > 130) return label;
  return tidied;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classify(
  event: string,
): { phase: IncidentPhase; label: string; signal: string } | undefined {
  // Shared noise gate: a "great teamwork" / "coffee run" line never counts as an
  // incident event, even if it incidentally matches a phase keyword.
  if (isSocialNoise(event)) return undefined;
  for (const rule of PHASE_RULES) {
    const m = event.match(rule.test);
    if (m) return { phase: rule.phase, label: rule.label(m), signal: m[0] };
  }
  return undefined;
}

/**
 * Distill raw 1:1 message entries into a material-event timeline.
 *
 * - keeps only phase-bearing events (drops social/noise lines)
 * - de-duplicates consecutive same-phase events (no three "diagnosis" rows in a row)
 * - always preserves the first detection and the final recovery as bookends
 * - falls back to the first/last raw events if nothing classified, so the
 *   schema's minItems:1 is never violated on a thin transcript
 */
export function distillTimeline(raw: TimelineEntry[], maxEvents = 8): TimelineEntry[] {
  if (raw.length === 0) return [];

  const kept: Array<TimelineEntry & { phase: IncidentPhase }> = [];
  let lastPhase: IncidentPhase | undefined;

  for (const entry of raw) {
    const hit = classify(entry.event);
    if (!hit) continue;
    // Collapse immediate repeats of the same phase to keep the narrative tight,
    // but never collapse a recovery (the resolution must always show).
    if (hit.phase === lastPhase && hit.phase !== "recovery") continue;
    kept.push({
      time: entry.time,
      event: eventDescription(entry.event, hit.signal, hit.label, hit.phase === "detection"),
      phase: hit.phase,
    });
    lastPhase = hit.phase;
  }

  // Always anchor the timeline on the first message — an incident timeline must
  // show how it started. If the opener wasn't already kept (or was reframed as a
  // later phase), prepend it as the detection event.
  const opener = raw[0];
  const openerKept = kept.some(
    (k) => k.time === opener.time && firstMatchesOpener(k.event, opener),
  );
  if (!openerKept) {
    const firstHit = classify(opener.event);
    kept.unshift({
      time: opener.time,
      event: eventDescription(
        opener.event,
        firstHit?.signal ?? "",
        "Detection: issue reported",
        true,
      ),
      phase: firstHit?.phase ?? "detection",
    });
  }

  if (kept.length === 0) {
    const bookends = [raw[0], raw[raw.length - 1]].filter(Boolean) as TimelineEntry[];
    return dedupeByTime(bookends);
  }

  const trimmed = capPreservingBookends(kept, maxEvents);
  return dedupeByTime(trimmed.map(({ time, event }) => ({ time, event })));
}

/** Did a kept event derive from the opener message (same leading substance)? */
function firstMatchesOpener(keptEvent: string, opener: TimelineEntry): boolean {
  const openerBody = opener.event
    .replace(/^@?[\w .-]{1,30}:\s*/, "")
    .trim()
    .slice(0, 40);
  return (
    openerBody.length > 0 &&
    keptEvent.toLowerCase().startsWith(openerBody.slice(0, 20).toLowerCase())
  );
}

/** Cap the list but always retain the first detection-ish and final recovery. */
function capPreservingBookends<T extends { phase: IncidentPhase }>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const first = items[0];
  const recoveryIdx = items.map((i) => i.phase).lastIndexOf("recovery");
  const last = recoveryIdx >= 0 ? items[recoveryIdx] : items[items.length - 1];
  const middle = items.slice(1, items.length - 1).slice(0, Math.max(0, max - 2));
  return [first, ...middle, last];
}

function dedupeByTime(entries: TimelineEntry[]): TimelineEntry[] {
  const seen = new Set<string>();
  const out: TimelineEntry[] = [];
  for (const e of entries) {
    const key = `${e.time}|${e.event}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
