import { markTitleDraft } from "../slack/confirm/draft.js";
import { normalizeWorkflowSource, stripDraftCommand } from "../forge/source-text.js";

export { stripDraftCommand };

export type DraftTemplateId =
  | "technical_note"
  | "executive_memo"
  | "research_report"
  | "meeting_brief"
  | "decision_record";

export type DraftInference = {
  templateId: string;
  templateLabel: string;
  confidence: "high" | "medium" | "low" | "explicit";
  signals: string[];
  draftData: Record<string, unknown>;
  filename: string;
  preview: string[];
  /** Ranked template options (winner first), for the picker. */
  candidates: { templateId: DraftTemplateId; label: string }[];
  /** True when the top two candidates are close enough that we should ask, not guess. */
  ambiguous: boolean;
};

const TEMPLATE_LABELS: Record<DraftTemplateId, string> = {
  technical_note: "Technical note",
  executive_memo: "Executive memo",
  research_report: "Research report",
  meeting_brief: "Meeting brief",
  decision_record: "Decision record",
};

/** Narrow an untrusted string (e.g. a Block Kit button value) to a draft template id. */
export function isDraftTemplateId(value: string): value is DraftTemplateId {
  return value in TEMPLATE_LABELS;
}

type Score = {
  templateId: DraftTemplateId;
  points: number;
  signals: string[];
};

function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isEquationFence(line: string): boolean {
  return /^\$\$/.test(line) || /^\\\[/.test(line) || /^\\\]/.test(line);
}

function plainLine(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[•*\-–]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\*\*/g, "")
    .trim();
}

function contentLines(text: string): string[] {
  return normalizeLines(text)
    .filter((line) => !/^#{1,6}\s+\S/.test(line))
    .filter((line) => !/^source\s*:/i.test(line))
    .filter((line) => !isEquationFence(line))
    .map(plainLine)
    .filter(Boolean);
}

function firstHeadingOrLine(lines: string[], fallback: string): string {
  const heading = lines.find((line) => /^#{1,3}\s+\S/.test(line));
  const raw = plainLine(heading ?? lines[0] ?? fallback);
  return titleFromLine(raw, fallback);
}

/**
 * Turn the first heading/line into a real document title. An explicit heading or
 * short label-like line is kept as-is; a full prose sentence is trimmed to its
 * leading clause (a title, not a paragraph). A bare URL falls back rather than
 * titling the document with a link.
 */
function titleFromLine(raw: string, fallback: string): string {
  const line = raw
    .replace(/\s+/g, " ")
    .replace(/^(?:abstract|summary|overview|notes?|tl;?dr|context|re)\s*[:\-–—]\s*/i, "")
    .trim();
  if (!line || /^https?:\/\//i.test(line)) return fallback;

  // Cut at the first internal sentence break so a prose line yields its leading
  // clause, not a paragraph: "We shipped the release. Risk: …" → "We shipped the
  // release"; "Weekly update: pipeline improved…" → "Weekly update". A clause of
  // ≥2 words is a real title and is always preferred over a mid-sentence word
  // slice, so the title never ends on a dangling word like "…recommendation is".
  const clause = line.match(/^(.+?)(?:[.;](?=\s|$)|:\s|\s[-–—]\s)/)?.[1]?.trim();
  const words = line.split(" ");
  const candidate =
    clause && clause.split(" ").length >= 2
      ? clause
      : words.length <= 9
        ? line
        : // No usable clause break: keep whole words up to ~9 but never strand a
          // trailing connective ("is", "to", "and"…) that reads as a cut-off.
          trimDanglingWords(words.slice(0, 9).join(" "));
  return candidate.replace(/[:\-–—\s]+$/, "").slice(0, 90) || fallback;
}

/** Words that, left at the end of a truncated title, read as a sentence cut mid-thought. */
const DANGLING_TAIL =
  /\s+(?:is|are|was|were|to|the|a|an|and|or|of|for|with|that|this|on|in|at|by|as|recommendation|recommend)$/i;

/** Drop trailing connective words so a word-sliced title doesn't dangle ("…recommendation is"). */
function trimDanglingWords(text: string): string {
  let out = text.trim();
  // Strip up to a few dangling tail words; stop once the title ends on a content word.
  for (let i = 0; i < 4 && DANGLING_TAIL.test(out); i++) {
    out = out.replace(DANGLING_TAIL, "").trim();
  }
  return out || text;
}

function firstParagraph(text: string): string {
  const paragraph = text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find((part) => contentLines(part).length > 0);
  if (!paragraph) return "Draft assembled from Slack notes.";
  return contentLines(paragraph).join(" ").replace(/\s+/g, " ").slice(0, 650);
}

function sentenceSummary(text: string): string {
  const bullets = extractBullets(text);
  if (bullets.length > 0) return bullets.slice(0, 3).join("; ").slice(0, 420);

  const first = firstParagraph(text);
  const sentence = first.match(/^(.+?[.!?])(?:\s|$)/)?.[1];
  return (sentence ?? first).slice(0, 420);
}

function extractBullets(text: string): string[] {
  return normalizeLines(text)
    .filter((line) => /^[•*\-–]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
    .map(plainLine)
    .filter((line) => line.length > 0)
    .slice(0, 8);
}

function extractUrls(text: string): string[] {
  return [...text.matchAll(/\bhttps?:\/\/[^\s)>\]]+/gi)].map((m) => m[0]).slice(0, 8);
}

function extractEquations(text: string): Array<{ label: string; latex: string; alt: string }> {
  const equations: Array<{ label: string; latex: string; alt: string }> = [];
  for (const m of text.matchAll(/\$\$([\s\S]+?)\$\$/g)) {
    const latex = normalizeLatexFragment(m[1].trim());
    if (latex) {
      equations.push({
        label: `Equation ${equations.length + 1}`,
        latex,
        alt: `Equation ${equations.length + 1} from Slack draft`,
      });
    }
  }
  for (const m of text.matchAll(/\\\[([\s\S]+?)\\\]/g)) {
    const latex = normalizeLatexFragment(m[1].trim());
    if (latex) {
      equations.push({
        label: `Equation ${equations.length + 1}`,
        latex,
        alt: `Equation ${equations.length + 1} from Slack draft`,
      });
    }
  }
  return equations.slice(0, 6);
}

function normalizeLatexFragment(latex: string): string {
  return latex
    .replace(/\bsoftmax\s*\(/gi, "\\operatorname{softmax}(")
    .replace(/\bsqrt\s*\(\s*([^)]+?)\s*\)/gi, "\\sqrt{$1}");
}

function textWithoutEquationBlocks(text: string): string {
  return text
    .replace(/\$\$[\s\S]+?\$\$/g, "\n")
    .replace(/\\\[[\s\S]+?\\\]/g, "\n")
    .trim();
}

function explicitAfter(text: string, label: RegExp): string | undefined {
  for (const line of normalizeLines(text)) {
    const m = line.match(label);
    if (m?.[1]?.trim()) return plainLine(m[1]).slice(0, 700);
  }
  return undefined;
}

function extractActions(text: string): Array<{ title: string; owner: string; due: string }> {
  const actions: Array<{ title: string; owner: string; due: string }> = [];
  const seen = new Set<string>();
  for (const raw of normalizeLines(text)) {
    const line = plainLine(raw);
    const m = line.match(
      /^(?:action|todo|next step|follow[- ]?up|owner|we should|we need to|need to)[:\s-]+(.+)$/i,
    );
    if (!m?.[1]) continue;
    const title = m[1].trim().replace(/[.]+$/, "");
    const key = title.toLowerCase();
    if (title.length < 4 || seen.has(key)) continue;
    seen.add(key);
    actions.push({ title, owner: "Team", due: "Next working session" });
  }
  return actions.slice(0, 5);
}

/**
 * Clean prose for plain-text fields (a memo's Context, a meeting's background).
 * Unlike markdownBody this targets a single flowing paragraph: it drops headings,
 * source/equation lines, and bare Slack mentions, then collapses to one block so
 * the raw note structure (and any stray @mention) never leaks into the PDF.
 */
function cleanBackground(text: string, max = 1200): string {
  const cleaned = textWithoutEquationBlocks(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^#{1,6}\s+\S/.test(line) && !/^source\s*:/i.test(line))
    .map((line) =>
      plainLine(line)
        .replace(/<@[A-Z0-9]+>/g, "")
        .replace(/@forge\b/gi, "")
        .trim(),
    )
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Source notes captured for review.").slice(0, max);
}

function markdownBody(text: string, options?: { inlineSingleReference?: boolean }): string {
  const urls = extractUrls(text);
  const body = textWithoutEquationBlocks(text)
    .split(/\r?\n/)
    .filter((line) => !/^#{1,6}\s+\S/.test(line.trim()))
    .filter((line) => !/^source\s*:/i.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const safeBody =
    body ||
    (extractEquations(text).length
      ? "Equation extracted below."
      : "Source text captured for review.");
  const reference =
    options?.inlineSingleReference !== false && urls.length === 1
      ? `\n\nReference: ${urls[0]}`
      : "";
  return `${safeBody}${reference}`.trim().slice(0, 6000);
}

function filenameFor(templateId: DraftTemplateId, title: string): string {
  const slug = title
    .replace(/^DRAFT\s+[-–—]\s+/i, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const prefix = templateId
    .split("_")
    .map((part) => part.replace(/^\w/, (c) => c.toUpperCase()))
    .join("-");
  return `${prefix}-${slug || "Draft"}.pdf`;
}

function scoreInput(text: string): Score[] {
  const lower = text.toLowerCase();
  const scores: Score[] = [
    { templateId: "technical_note", points: 0, signals: [] },
    { templateId: "research_report", points: 0, signals: [] },
    { templateId: "meeting_brief", points: 0, signals: [] },
    { templateId: "decision_record", points: 0, signals: [] },
    { templateId: "executive_memo", points: 1, signals: ["fallback memo shape"] },
  ];
  const bump = (templateId: DraftTemplateId, points: number, signal: string) => {
    const score = scores.find((s) => s.templateId === templateId)!;
    score.points += points;
    score.signals.push(signal);
  };

  const hasEquationBlock = /\$\$[\s\S]+?\$\$|\\\[/.test(text);
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const lineCount = normalizeLines(text).length;
  const shortEquationNote = hasEquationBlock && (wordCount <= 180 || lineCount <= 18);

  if (shortEquationNote) {
    bump("technical_note", 9, "short equation note");
  }
  if (/\b(formula|equation|latex|derivation|transformer|attention)\b/.test(lower)) {
    bump("technical_note", 2, "technical note language");
  }

  if (hasEquationBlock && !shortEquationNote) bump("research_report", 5, "equation block");
  if (!shortEquationNote && /\\(?:frac|sqrt|sum|int|alpha|beta|gamma|theta|sigma)\b/.test(text)) {
    bump("research_report", 3, "LaTeX-style math");
  }
  if (/\b(abstract|finding|hypothesis|method|source|citation|research|model)\b/.test(lower)) {
    bump("research_report", 2, "research language");
  }
  if (extractUrls(text).length > 0) bump("research_report", 1, "source URL");

  if (/\b(agenda|attendees?|meeting|prep|standup|sync|workshop)\b/.test(lower)) {
    bump("meeting_brief", 3, "meeting language");
  }
  if (/\b(action items?|follow[- ]?ups?|next steps?)\b/.test(lower)) {
    bump("meeting_brief", 2, "actions/follow-ups");
  }

  if (
    /\b(adr|decision|decided|accepted|proposed|alternative|trade[- ]?off|consequence)\b/.test(lower)
  ) {
    bump("decision_record", 4, "decision language");
  }
  if (/\b(option a|option b|alternatives? considered)\b/.test(lower)) {
    bump("decision_record", 2, "alternatives");
  }

  if (/\b(exec|leadership|update|summary|risk|recommendation)\b/.test(lower)) {
    bump("executive_memo", 2, "memo language");
  }

  return scores.sort((a, b) => b.points - a.points);
}

function confidence(points: number): DraftInference["confidence"] {
  if (points >= 5) return "high";
  if (points >= 3) return "medium";
  return "low";
}

function findingTitle(line: string): string {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length <= 5) return line.slice(0, 70);
  return words.slice(0, 5).join(" ").slice(0, 70);
}

function buildResearchReport(text: string, title: string, now: Date): Record<string, unknown> {
  const equations = extractEquations(text);
  const urls = extractUrls(text);
  const bullets = extractBullets(text);
  const findings = (bullets.length ? bullets : [sentenceSummary(text)]).slice(0, 5).map((line) => {
    const titleText = findingTitle(line);
    return {
      title: titleText,
      summary: titleText === line ? "Captured from Slack source notes." : line,
      confidence: "medium",
    };
  });
  return markTitleDraft({
    title,
    author: "Forge",
    date: today(now),
    abstract: sentenceSummary(text),
    sections: [
      {
        title: "Slack Notes",
        body_md: markdownBody(text),
      },
    ],
    ...(equations.length ? { equations } : {}),
    findings,
    ...(urls.length > 1
      ? { sources: urls.map((url, i) => ({ citation: `Source ${i + 1}`, url })) }
      : {}),
  });
}

function buildTechnicalNote(text: string, title: string, now: Date): Record<string, unknown> {
  const urls = extractUrls(text);
  const inferredLabel = equationsLabel(text);
  const equations = extractEquations(text).map((eq, i) => ({
    ...eq,
    label: eq.label === `Equation ${i + 1}` && inferredLabel ? inferredLabel : eq.label,
  }));
  return markTitleDraft({
    title,
    author: "Forge",
    date: today(now),
    summary: sentenceSummary(text),
    body_md: markdownBody(text, { inlineSingleReference: false }),
    ...(equations.length ? { equations } : {}),
    ...(urls.length
      ? {
          references: urls.map((url, i) => ({
            citation: urls.length === 1 ? "Source" : `Source ${i + 1}`,
            url,
          })),
        }
      : {}),
  });
}

function equationsLabel(text: string): string | undefined {
  const label = normalizeLines(text)
    .map(plainLine)
    .find((line) => /\b(score|formula|equation|model)\s*:?$/i.test(line));
  if (!label) return undefined;
  return label.replace(/:$/, "");
}

function notForge(name: string): boolean {
  return name.replace(/^@/, "").toLowerCase() !== "forge";
}

function buildMeetingBrief(text: string, title: string, now: Date): Record<string, unknown> {
  const bullets = extractBullets(text);
  const attendeesLine = explicitAfter(text, /^attendees?\s*[:-]\s*(.+)$/i);
  const attendees = attendeesLine
    ? attendeesLine
        .split(/,|;/)
        .map((s) => s.trim())
        .filter(Boolean)
        .filter(notForge)
    : [...text.matchAll(/@[a-z][\w.-]+/gi)]
        .map((m) => m[0].replace(/^@/, ""))
        .filter(notForge)
        .slice(0, 8);
  const agenda = (bullets.length ? bullets : [sentenceSummary(text)]).slice(0, 5).map((topic) => ({
    topic,
    duration: "10 min",
  }));
  const actions = extractActions(text);
  return markTitleDraft({
    title,
    date: today(now),
    attendees: attendees.length ? attendees : ["Team"],
    objective:
      explicitAfter(text, /^objective\s*[:-]\s*(.+)$/i) ??
      explicitAfter(text, /^goal\s*[:-]\s*(.+)$/i) ??
      sentenceSummary(text),
    agenda,
    prep_items: actions.length
      ? actions.map((a) => a.title)
      : ["Review the source notes before the meeting."],
    background: cleanBackground(text, 1200),
  });
}

function buildDecisionRecord(text: string, title: string, now: Date): Record<string, unknown> {
  const bullets = extractBullets(text);
  const alternatives = bullets
    .filter((line) => /\b(option|alternative|approach)\b/i.test(line))
    .slice(0, 4)
    .map((line) => ({ title: line.slice(0, 70), description: line }));
  return markTitleDraft({
    title,
    status: /\baccepted|decided\b/i.test(text) ? "accepted" : "proposed",
    date: today(now),
    context: explicitAfter(text, /^context\s*[:-]\s*(.+)$/i) ?? firstParagraph(text).slice(0, 900),
    decision:
      explicitAfter(text, /^decision\s*[:-]\s*(.+)$/i) ??
      explicitAfter(text, /^we\s+decided\s*[:-]?\s*(.+)$/i) ??
      "Decision statement not explicit in source; review before finalizing.",
    consequences:
      explicitAfter(text, /^consequences?\s*[:-]\s*(.+)$/i) ??
      explicitAfter(text, /^impact\s*[:-]\s*(.+)$/i) ??
      "Consequences were not explicit in source; review before finalizing.",
    alternatives: alternatives.length
      ? alternatives
      : [
          {
            title: "No explicit alternative captured",
            description: "Source notes did not name alternatives; review before finalizing.",
          },
        ],
  });
}

function buildExecutiveMemo(text: string, title: string, now: Date): Record<string, unknown> {
  const bullets = extractBullets(text);
  const background = cleanBackground(text, 1600);
  let summary = sentenceSummary(text);
  let sections = bullets.length
    ? [{ title: "Key Points", body: bullets.map((b) => `- ${b}`).join("\n") }]
    : [{ title: "Context", body: background }];

  // Don't print the same prose as both Summary and Context. When a short note
  // would duplicate, summarize the *content* (drop a leading label like "Weekly
  // update:" that the title already carries) and let Context keep the full text —
  // distinct, informative, no repetition.
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  if (!bullets.length && norm(background) === norm(summary)) {
    const afterLabel = norm(summary)
      .replace(/^[^:]{1,40}:\s*/, "")
      .replace(/^\w/, (c) => c.toUpperCase())
      .trim();
    summary = afterLabel.length >= 12 ? afterLabel : norm(summary);
    sections = [{ title: "Context", body: background }];
  }

  const actions = extractActions(text);
  return markTitleDraft({
    title,
    author: "Forge",
    date: today(now),
    summary,
    sections,
    ...(actions.length ? { actions } : {}),
  });
}

function buildForTemplate(
  templateId: DraftTemplateId,
  text: string,
  title: string,
  now: Date,
): Record<string, unknown> {
  switch (templateId) {
    case "technical_note":
      return buildTechnicalNote(text, title, now);
    case "research_report":
      return buildResearchReport(text, title, now);
    case "meeting_brief":
      return buildMeetingBrief(text, title, now);
    case "decision_record":
      return buildDecisionRecord(text, title, now);
    case "executive_memo":
      return buildExecutiveMemo(text, title, now);
  }
}

/**
 * Infer the document shape. Pass `forceTemplateId` to rebuild against a specific
 * template — used when a low-confidence guess sends the user a template picker
 * and they choose one, so the picked template reuses the same source text.
 */
/**
 * Strip the bot command and Slack mentions once, up front, so every downstream
 * scorer and builder works on clean source — the engine is robust whether the
 * caller pre-stripped or handed us the raw `@forge draft …` message.
 */
function sanitizeSource(text: string): string {
  return normalizeWorkflowSource(text);
}

export function inferDraftDocument(
  raw: string,
  now = new Date(),
  forceTemplateId?: DraftTemplateId,
): DraftInference {
  const text = sanitizeSource(raw);
  const lines = normalizeLines(text);
  const title = firstHeadingOrLine(lines, "Forge Draft");
  const ranked = scoreInput(text);
  const winner = ranked[0];
  const templateId = forceTemplateId ?? winner.templateId;
  const chosen = forceTemplateId ? ranked.find((s) => s.templateId === forceTemplateId) : winner;

  // Two distinct content-bearing candidates within 1 point of each other → the
  // notes genuinely read as either, so we ask rather than silently picking. The
  // lone always-on fallback memo (points 1) doesn't count as a real rival.
  const rivals = ranked.filter((s) => s.points >= 2);
  const ambiguous =
    !forceTemplateId && rivals.length >= 2 && rivals[0].points - rivals[1].points <= 1;

  return {
    templateId,
    templateLabel: TEMPLATE_LABELS[templateId],
    // A forced pick is the user's explicit choice → treat it as high confidence.
    confidence: forceTemplateId ? "high" : confidence(winner.points),
    signals: (chosen ?? winner).signals.slice(0, 5),
    draftData: buildForTemplate(templateId, text, title, now),
    filename: filenameFor(templateId, title),
    preview: lines.map(plainLine).filter(Boolean).slice(0, 5),
    candidates: (ambiguous
      ? rivals
      : ranked.filter((s) => s.points > 0 || s.templateId === templateId)
    )
      .slice(0, 4)
      .map((s) => ({ templateId: s.templateId, label: TEMPLATE_LABELS[s.templateId] })),
    ambiguous,
  };
}
