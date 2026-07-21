import { WORKFLOWS, type WorkflowId } from "../../forge/workflows.js";
import { channelNameToIncidentId } from "../gather/channels.js";

export type SuggestedPrompt = { title: string; message: string };

/**
 * Signals we can read about the channel the user opened the Assistant pane from.
 * All Slack-native and deterministic — no LLM, no guessing at content we can't see.
 */
export type ChannelSignal = {
  /** Channel name, e.g. "incident-api-gateway" or "sales-northstar". */
  name?: string;
  /** Channel topic/purpose text, if available. */
  topic?: string;
  /** Whether the surrounding channel is the user's DM with the app. */
  isDm?: boolean;
};

/** Static prompt for one workflow, keyed by id so callers can dedup by id. */
function staticPromptFor(id: WorkflowId): SuggestedPrompt {
  const w = WORKFLOWS.find((x) => x.id === id)!;
  return { title: w.label, message: w.exampleCommand.replace(/^@forge\s+/i, "") };
}

const STATIC_PROMPTS: SuggestedPrompt[] = [
  staticPromptFor("draft"),
  ...WORKFLOWS.filter((w) => w.id !== "draft").map((w) => staticPromptFor(w.id)),
];

/**
 * Title-case a channel slug into a client hint ("sales-northstar" -> "Northstar").
 * Returns undefined when the trailing token isn't a plausible client name
 * (pure numbers, a quarter like "q3", a bare year) — we never present a date or
 * sequence number as if it were the client.
 */
function clientHintFromChannel(name: string): string | undefined {
  const m = name.match(/^(?:sales|deal|proposal|prospect)[-_](.+)$/i);
  if (!m) return undefined;
  const tokens = m[1].split(/[-_]/).filter(Boolean);
  const looksLikeName = tokens.some(
    (t) => /[a-z]/i.test(t) && !/^q[1-4]$/i.test(t) && !/^\d+$/.test(t),
  );
  if (!looksLikeName) return undefined;
  return tokens.map((w) => w.replace(/^\w/, (c) => c.toUpperCase())).join(" ");
}

/**
 * Rank the curated workflows for THIS channel, then return prompts most-relevant
 * first. The relevant workflow gets a channel-specific message ("incident report
 * from #incident-api-gateway") so the top suggestion is one tap from the right document.
 *
 * Pure and deterministic: same channel signal always yields the same prompts,
 * which is exactly the property that lets us test it.
 */
export function suggestedPromptsForChannel(signal: ChannelSignal): SuggestedPrompt[] {
  const name = signal.name?.toLowerCase().trim();
  const haystack = `${name ?? ""} ${signal.topic?.toLowerCase() ?? ""}`;

  // In a DM (no surrounding channel context) there's nothing to specialize on.
  if (!name || signal.isDm) return STATIC_PROMPTS;

  const winner = detectWorkflow(name, haystack);
  if (!winner) return STATIC_PROMPTS;

  const lead = leadPromptFor(winner, name);
  // Slack caps suggested prompts at 4 and we have more workflows than that, so
  // build: the context lead first, then draft (the always-available catch-all),
  // then the rest in WORKFLOWS order until full. Dedup by id, not label.
  const order: WorkflowId[] = [winner, "draft", ...WORKFLOWS.map((w) => w.id)];
  const seen = new Set<WorkflowId>([winner]);
  const prompts: SuggestedPrompt[] = [lead];
  for (const id of order) {
    if (seen.has(id) || prompts.length >= 4) continue;
    seen.add(id);
    prompts.push(staticPromptFor(id));
  }
  return prompts;
}

/** Which structured workflow does this channel most plausibly call for? */
function detectWorkflow(name: string, haystack: string): WorkflowId | undefined {
  if (/incident|outage|sev[-\s]?\d|postmortem|oncall|on-call/.test(haystack)) return "incident";
  if (/board|kpi|metrics|investor|quarterly|qbr/.test(haystack)) return "board";
  if (/sales|deal|proposal|prospect|account|client|revenue/.test(haystack)) return "proposal";
  if (/status|standup|weekly|sprint|eng-|team-|squad/.test(haystack)) return "status";
  // Channel name leading token still wins even without keyword in topic.
  if (/^(sales|deal|proposal|prospect)/.test(name)) return "proposal";
  return undefined;
}

/** The channel-specific lead prompt for the detected workflow. */
function leadPromptFor(id: WorkflowId, name: string): SuggestedPrompt {
  if (id === "incident") {
    const inc = channelNameToIncidentId(name);
    return {
      title: inc ? `Incident report for ${inc}` : "Incident report from this channel",
      message: `incident report from #${name}`,
    };
  }
  if (id === "proposal") {
    const client = clientHintFromChannel(name);
    return {
      title: client ? `Proposal for ${client}` : "Proposal from this discovery",
      message: client ? `proposal for ${client}` : `proposal from #${name}`,
    };
  }
  if (id === "status") {
    return {
      title: "Status report from this channel",
      message: `status for #${name}`,
    };
  }
  return {
    title: "Board pack from these metrics",
    message: "board pack — attach the KPI CSV",
  };
}
