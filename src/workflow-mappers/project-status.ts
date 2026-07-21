import { stripSlackMarkup } from "../slack/gather/slack-markup.js";
import { isSocialNoise } from "../slack/gather/text-signals.js";
import type { TranscriptLine } from "../slack/gather/transcript.js";

/**
 * Map a channel's recent activity to a project_status record. Like the other
 * mappers, this fabricates nothing: RAG, workstreams, blockers, and next steps
 * are all read out of the real messages. Where the channel is silent on a field,
 * we say so plainly so the human fills it in at the confirm step rather than
 * shipping an invented status.
 */

type Rag = "red" | "amber" | "green";
type EvidenceType = "rag" | "blocker" | "next_step" | "workstream";
type EvidenceItem = { type: EvidenceType; source: string; quote: string; permalink?: string };
type SourceAudit = {
  confidence: "high" | "medium" | "low";
  evidence_count: number;
  sources: string[];
  coverage: Record<EvidenceType, number>;
  warnings: string[];
};

const RED =
  /\b(blocked|blocker|broken|failing|critical|outage|at risk|slipp(?:ed|ing)|overdue|missed)\b/i;
const AMBER =
  /\b(delayed|behind|waiting on|pending|risk|concern|unclear|stuck|carry over|carryover)\b/i;
const GREEN =
  /\b(shipped|done|complete|completed|merged|resolved|on track|landed|launched|green)\b/i;

const BLOCKER =
  /\b(blocked on|blocked by|blocker|waiting on|waiting for|need(?:s|ed)? (?:approval|sign[- ]?off|access)|dependency on)\b/i;
const NEXT_STEP =
  /\b(next steps?|will (?:ship|deliver|start|run|begin|complete|finish)|plan(?:ning)? to|going to|todo|to-do|action item|follow[- ]?up|scheduled to|aim to)\b/i;

/** Theme buckets — a message joins the first workstream whose keywords it matches. */
const THEMES: Array<{ name: string; pattern: RegExp }> = [
  {
    name: "Campaign & Launch",
    pattern:
      /\b(campaign|creative|audience|placement|launch|awareness|media plan|marketing|traffick\w+|approvals?|brand recall|qualtrics)\b/i,
  },
  {
    name: "Infrastructure & Platform",
    pattern:
      /\b(infra|infrastructure|platform|deploy|pipeline|ci\/cd|kubernetes|terraform|cluster)\b/i,
  },
  {
    name: "API & Integrations",
    pattern: /\b(api|endpoint|integration|webhook|gateway|sdk|auth|sso)\b/i,
  },
  {
    name: "Data & Analytics",
    pattern: /\b(data|analytics|dashboard|metric|etl|warehouse|report|pipeline)\b/i,
  },
  {
    name: "Frontend & UX",
    pattern: /\b(ui|ux|frontend|design|component|page|screen|css|layout)\b/i,
  },
  {
    name: "Quality & Reliability",
    pattern: /\b(test|qa|bug|incident|reliability|monitoring|alert|sla|regression)\b/i,
  },
];

function ragForText(text: string): Rag {
  if (RED.test(text)) return "red";
  if (AMBER.test(text)) return "amber";
  if (GREEN.test(text)) return "green";
  return "amber";
}

/** Worst-wins roll-up across workstream RAGs. */
function overallRag(rags: Rag[]): Rag {
  if (rags.includes("red")) return "red";
  if (rags.includes("amber")) return "amber";
  return rags.length ? "green" : "amber";
}

function firstSentence(text: string, max = 240): string {
  const cleaned = stripSlackMarkup(text).replace(/\s+/g, " ").trim();
  const sentence = cleaned.match(/^(.+?[.!?])(?:\s|$)/)?.[1];
  return (sentence ?? cleaned).slice(0, max);
}

function cleanStatusSentence(text: string, max = 180): string {
  let cleaned = firstSentence(text, max * 2)
    .replace(/^@[\w.-]+\s+/, "")
    .replace(/^Hi Team,\s*/i, "")
    .replace(/^[A-Z][\w.-]+\s+(Pacing update:)/, "$1")
    .replace(/\bCampaign Goals\b\s*/i, "")
    .replace(/\bPrimary Goal:\s*/i, "Primary goal: ")
    .replace(/\s*\bSecondary Goal:\s*/i, "; secondary goal: ")
    .replace(/\s+/g, " ")
    .trim();

  const nextIndex = cleaned.search(/\bNext Steps?\s*:/i);
  if (nextIndex > 0) cleaned = cleaned.slice(0, nextIndex).trim();
  cleaned = cleaned.replace(/[;:,\s]+$/, "").trim();
  return cleaned.slice(0, max);
}

function uniqueCleanSentences(
  lines: TranscriptLine[],
  maxItems: number,
  maxLength: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const item = cleanStatusSentence(line.text, maxLength);
    const key = item.toLowerCase();
    if (item.length < 6 || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeListText(text: string, max = 180): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/(?:^|\s)[•-]\s*/g, "; ")
    .replace(/^[\s:;•-]+/, "")
    .replace(/\s*;\s*/g, "; ")
    .replace(/(?:;\s*){2,}/g, "; ")
    .replace(/;\s*$/, "")
    .trim()
    .slice(0, max);
}

function nextStepSentence(text: string, max = 180): string {
  const cleaned = stripSlackMarkup(text).replace(/\s+/g, " ").trim();
  const labeled = cleaned.match(/\bnext steps?\s*:\s*(.+)$/i)?.[1];
  if (labeled) return normalizeListText(labeled, max);
  return firstSentence(cleaned, max);
}

function signalLines(lines: TranscriptLine[]): TranscriptLine[] {
  return lines.filter((l) => l.text.trim().length > 0 && !isSocialNoise(l.text));
}

function buildWorkstreams(
  lines: TranscriptLine[],
): Array<{ name: string; status: string; rag: Rag; notes: string }> {
  const buckets = new Map<string, TranscriptLine[]>();
  for (const line of lines) {
    const theme = THEMES.find((t) => t.pattern.test(line.text));
    if (!theme) continue;
    const arr = buckets.get(theme.name) ?? [];
    arr.push(line);
    buckets.set(theme.name, arr);
  }

  const workstreams = [...buckets.entries()].map(([name, group]) => {
    const text = group.map((l) => l.text).join(" ");
    const rag = ragForText(text);
    const status = rag === "green" ? "On track" : rag === "red" ? "At risk" : "In progress";
    const notes = uniqueCleanSentences(group, 2, 120).join(" ");
    return { name, status, rag, notes: notes || "Activity noted in channel; details to confirm." };
  });

  // project_status requires ≥1 workstream. When no theme matched, fold the most
  // salient lines into a single general workstream rather than invent themes.
  if (workstreams.length === 0) {
    const notes = uniqueCleanSentences(lines, 2, 120).join(" ");
    return [
      {
        name: "Team progress",
        status: "In progress",
        rag: "amber" as Rag,
        notes: notes || "Channel activity captured; confirm specifics before sending.",
      },
    ];
  }
  return workstreams;
}

function extractMatching(lines: TranscriptLine[], pattern: RegExp, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    if (!pattern.test(line.text)) continue;
    const item =
      pattern === NEXT_STEP ? nextStepSentence(line.text, 160) : firstSentence(line.text, 160);
    const key = item.toLowerCase();
    if (item.length < 6 || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

function sourceForLine(line: TranscriptLine, fallback: string): string {
  if (line.channel?.trim()) {
    const channel = line.channel.trim();
    return channel.startsWith("#") ? channel : `#${channel}`;
  }
  const source = fallback.trim();
  if (source) {
    return source.startsWith("#") || source.includes(" ") ? source : `#${source}`;
  }
  const speaker = line.speaker.trim();
  return speaker && speaker !== "team" ? speaker : "channel history";
}

function titleCaseWords(text: string): string {
  return text
    .split(/\s+/)
    .map((word) =>
      word.length <= 3
        ? word.toUpperCase()
        : word.replace(/\b[a-z]/g, (char) => char.toUpperCase()),
    )
    .join(" ");
}

function evidenceForLines(lines: TranscriptLine[], fallbackSource: string): EvidenceItem[] {
  const seen = new Set<string>();
  const evidence: EvidenceItem[] = [];

  const push = (type: EvidenceType, line: TranscriptLine) => {
    const quote =
      type === "next_step" ? nextStepSentence(line.text, 180) : cleanStatusSentence(line.text, 180);
    const key = `${type}:${quote.toLowerCase()}`;
    if (quote.length < 6 || seen.has(key)) return;
    seen.add(key);
    evidence.push({
      type,
      source: sourceForLine(line, fallbackSource),
      quote,
      ...(line.permalink ? { permalink: line.permalink } : {}),
    });
  };

  const passes: Array<{
    type: EvidenceType;
    max: number;
    matches: (line: TranscriptLine) => boolean;
  }> = [
    { type: "blocker", max: 2, matches: (line) => BLOCKER.test(line.text) },
    { type: "next_step", max: 2, matches: (line) => NEXT_STEP.test(line.text) },
    {
      type: "rag",
      max: 3,
      matches: (line) => RED.test(line.text) || AMBER.test(line.text) || GREEN.test(line.text),
    },
    {
      type: "workstream",
      max: 3,
      matches: (line) =>
        !BLOCKER.test(line.text) &&
        !NEXT_STEP.test(line.text) &&
        !RED.test(line.text) &&
        !AMBER.test(line.text) &&
        !GREEN.test(line.text) &&
        THEMES.some((t) => t.pattern.test(line.text)),
    },
  ];

  for (const pass of passes) {
    let added = 0;
    for (const line of lines) {
      if (evidence.length >= 8 || added >= pass.max) break;
      if (pass.matches(line)) {
        const before = evidence.length;
        push(pass.type, line);
        if (evidence.length > before) added += 1;
      }
    }
  }

  return evidence.slice(0, 8);
}

function sourceAudit(
  evidence: EvidenceItem[],
  blockers: string[],
  nextSteps: string[],
): SourceAudit {
  const coverage: Record<EvidenceType, number> = {
    rag: 0,
    blocker: 0,
    next_step: 0,
    workstream: 0,
  };
  const sources = new Set<string>();
  for (const item of evidence) {
    coverage[item.type] += 1;
    sources.add(item.source);
  }

  const warnings: string[] = [];
  if (evidence.length === 0) {
    warnings.push("No grounding evidence captured; reviewer should add source-backed detail.");
  }
  if (blockers.length > 0 && coverage.blocker === 0) {
    warnings.push("Blockers are listed, but no blocker evidence was captured.");
  }
  if (nextSteps.some((s) => /No explicit next steps captured/i.test(s))) {
    warnings.push("No explicit next steps were found in source activity.");
  } else if (nextSteps.length > 0 && coverage.next_step === 0) {
    warnings.push("Next steps are listed, but no next-step evidence was captured.");
  }

  const confidence =
    warnings.length === 0 && evidence.length >= 3 ? "high" : evidence.length > 0 ? "medium" : "low";

  return {
    confidence,
    evidence_count: evidence.length,
    sources: [...sources].slice(0, 8),
    coverage,
    warnings,
  };
}

export function transcriptLinesToProjectStatus(
  lines: TranscriptLine[],
  options: { period?: string; channelLabel?: string } = {},
): Record<string, unknown> {
  const signal = signalLines(lines);
  const workstreams = buildWorkstreams(signal);
  const blockers = extractMatching(signal, BLOCKER, 5);
  const nextSteps = extractMatching(signal, NEXT_STEP, 5);
  const finalNextSteps = nextSteps.length
    ? nextSteps
    : ["No explicit next steps captured from the channel — add before sending."];

  const channel = options.channelLabel ? options.channelLabel.replace(/^#/, "") : "the team";
  const evidenceSource = options.channelLabel ?? "channel history";
  const evidence = evidenceForLines(signal, evidenceSource);
  const summarySource = signal
    .map((l) => l.text)
    .filter((t) => GREEN.test(t) || RED.test(t) || AMBER.test(t))
    .slice(0, 3)
    .map((t) => cleanStatusSentence(t, 160))
    .join(" ");

  const titleSubject = options.channelLabel
    ? titleCaseWords(options.channelLabel.replace(/^#/, "").replace(/[-_]/g, " "))
    : "Team";

  return {
    title: `${titleSubject} — Weekly Status`,
    period: options.period ?? new Date().toISOString().slice(0, 10),
    author: "Forge",
    overall_rag: overallRag(workstreams.map((w) => w.rag)),
    summary:
      summarySource ||
      `Status assembled from recent activity in ${channel}. Review and confirm before sending.`,
    workstreams,
    blockers,
    next_steps: finalNextSteps,
    evidence,
    source_audit: sourceAudit(evidence, blockers, finalNextSteps),
  };
}
