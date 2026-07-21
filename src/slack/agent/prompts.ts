import { WORKFLOWS } from "../../forge/workflows.js";
import type { RoutedIntent } from "../router.js";

/** One scannable line per workflow: what you type → what you get. */
const WORKFLOW_PITCH: Record<string, string> = {
  proposal: "client-ready sales proposal",
  incident: "incident report from the channel timeline",
  board: "board KPI pack from your numbers",
  status: "weekly RAG status from a channel",
  draft: "a clean PDF from any pasted notes",
};

function workflowMenu(): string[] {
  return WORKFLOWS.map((w) => {
    const cmd = w.exampleCommand.replace(/^@forge\s+/i, "");
    return `• \`${cmd}\` → ${WORKFLOW_PITCH[w.id] ?? w.label}`;
  });
}

/**
 * The first thing you see when you open Forge. Short, warm, and shows the value
 * (you get a real reviewed PDF) — not a wall of flags.
 */
export function formatWelcomeMessage(channelName?: string): string {
  const where = channelName ? ` I can see *#${channelName}* — happy to start there.` : "";
  return [
    `👋 *Hey! I'm Forge.* I turn what's already in Slack into a finished, reviewed PDF.${where}`,
    "",
    "Open the App Home tab for guided forms, or try one of these:",
    ...workflowMenu(),
    "",
    "_You always review and approve before anything exports — pricing, KPIs, and severities come from your data, never invented._",
  ].join("\n");
}

export function formatHelpMessage(): string {
  return [
    "*Forge* turns Slack workstreams into reviewed, schema-validated PDFs.",
    "",
    "*Fastest start*",
    "• Open the Forge App Home tab for guided *New document* and *Board / metrics pack* forms.",
    "• Or mention me with one of these commands:",
    "",
    "*What I can make*",
    ...workflowMenu(),
    "",
    "*How it works*",
    "• I gather source, fit it to a template, and run checks.",
    "• You review a short summary, then *Generate PDF*.",
    "• *Approve & finalize* removes the DRAFT mark when you're ready to send.",
    "",
    "_`@forge summarize this thread` returns text only — no PDF._",
  ].join("\n");
}

export const SUMMARIZE_REPLY =
  "I can summarize threads in plain text only — no PDF for summarize requests. " +
  "For a deliverable document, try `@forge help` and pick a workflow.";

export function buildReply(intent: RoutedIntent): string {
  switch (intent.kind) {
    case "help":
      return formatHelpMessage();
    case "summarize":
      return SUMMARIZE_REPLY;
    case "brand":
      return "Extracting or applying a brand kit for this thread.";
    case "template":
      return "Running Template Studio — scaffold, validate, and register a custom template.";
    case "details":
      return "Loading build receipt for the last delivery in this thread.";
    case "document":
      return "Routing to an explicit template — paste your content after the command.";
    case "workflow":
      if (intent.workflowId === "incident") {
        return "Gathering incident source — I'll show a short summary before export.";
      }
      if (intent.workflowId === "proposal") {
        return "Gathering discovery — paste pricing in-thread when asked.";
      }
      if (intent.workflowId === "board") {
        return "Reading KPI inputs. I'll validate the pack before approval.";
      }
      if (intent.workflowId === "status") {
        return "Reading the channel. I'll group it into a RAG status before approval.";
      }
      if (intent.workflowId === "draft") {
        return "Reading your notes. I'll infer a safe DocForge template before approval.";
      }
      return "Try `@forge help` for the full command list.";
    case "unknown":
      return [
        "I'm not sure which document you want yet — here's what I can make:",
        ...workflowMenu(),
        "",
        "_Or just paste your notes after `@forge draft` and I'll pick the right format._",
      ].join("\n");
  }
}
