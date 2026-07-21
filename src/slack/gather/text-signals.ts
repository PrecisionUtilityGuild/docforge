/**
 * Shared text-signal heuristics for turning raw Slack chatter into
 * document-worthy content. One place owns "what's noise" and "how relevant is
 * this line" so every workflow (incident, proposal, board) classifies the same
 * way instead of each reinventing its own regexes.
 *
 * This is deliberately NOT embeddings/RAG — `salience` is a transparent,
 * dependency-free weighted sum of weak signals (does it name a system? is it a
 * question? is it social?). It is the honest, debuggable cousin of a vector
 * relevance score: you can read exactly why a line scored the way it did.
 */

const SOCIAL_PATTERNS: RegExp[] = [
  /\b(coffee run|team lunch|grab(?:bing)? lunch|lunch at|happy hour|stand[- ]?up|out of office|ooo\b|pto\b|water ?cooler|react with|reactions? for headcount|who'?s (?:in|coming|joining)|join us|congrats|welcome to the (?:team|channel)|great (?:job|work|teamwork)|nice work|left a comment on a figma file|open in figma button|reply button|🎉|☕|🍜)\b/i,
];

const GREETING_ONLY =
  /^(?:hi|hey|hello|thanks|thank you|lol|haha|nice|cool|awesome|sounds good|ok(?:ay)?|yep|yes|np|👍|🙏)[\s!.,]*$/i;

/**
 * Social/logistics chatter with no place in a generated document — coffee runs,
 * lunches, standups, reaction polls, bare greetings. Used at the gather source
 * so noise never reaches scope, timeline, summary, or evidence-as-narrative.
 */
export function isSocialNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (GREETING_ONLY.test(t)) return true;
  return SOCIAL_PATTERNS.some((re) => re.test(t));
}

/** Signals that a line carries real work substance (systems, actions, scope). */
const WORK_TERMS =
  /\b(integrat\w+|migrat\w+|implement\w+|deploy\w+|scal\w+|customiz\w+|dashboard|analytics|api|sso|okta|training|kpi|automat\w+|onboard\w+|data|system|platform|solution|requirements?|scope|security|compliance|workflow|reporting|connector|pipeline|infrastructure|database|latency|outage|incident|rollback|root cause|oauth|handshake|idoc|timeout|error rate|connection pool|exhaust\w+|misconfig\w+|sev[- ]?\d|p[0-3]\b|tier ?[12])\b/i;

const NAMED_SYSTEM =
  /\b(?:[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,2}\s+(?:Connector|Integration|Gateway|Platform|Pipeline|API|Service)|[a-z][a-z0-9]*-(?:service|svc|gateway|api|db|queue|worker))\b/;

const COMMITMENT =
  /\b(will|going to|need(?:s|ed)? to|should|must|plan to|agreed to|by (?:eow|eod|next week|friday|monday)|deadline|due)\b/i;

const QUESTION = /\?\s*$/;

/**
 * Transparent relevance score for a Slack line, 0..~6. Higher = more
 * document-worthy. A weighted sum of independent weak signals — no model, fully
 * inspectable. Callers rank lines and keep the top-K instead of relying on a
 * single keyword being present.
 */
export function salience(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  if (isSocialNoise(t)) return 0;

  let score = 0;
  if (WORK_TERMS.test(t)) score += 2;
  if (NAMED_SYSTEM.test(t)) score += 2;
  if (COMMITMENT.test(t)) score += 1;
  if (QUESTION.test(t)) score += 1; // open questions are decision-relevant

  // Length sweet spot: a real requirement is a clause, not a fragment or a wall.
  const words = t.split(/\s+/).length;
  if (words >= 5 && words <= 40) score += 1;
  if (words < 3) score -= 1;

  return Math.max(0, score);
}

/** Convenience: is a line worth putting in a document at all? */
export function isDocumentWorthy(text: string, threshold = 2): boolean {
  return salience(text) >= threshold;
}
