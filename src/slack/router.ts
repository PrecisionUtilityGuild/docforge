import { findWorkflowByText, type WorkflowId } from "../forge/workflows.js";

export type RoutedIntent =
  | { kind: "help" }
  | { kind: "summarize" }
  | { kind: "details" }
  | { kind: "document"; rawText: string }
  | { kind: "brand"; rawText: string }
  | { kind: "template"; rawText: string }
  | { kind: "workflow"; workflowId: WorkflowId; rawText: string }
  | { kind: "unknown"; rawText: string };

export function stripBotMention(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+>/g, "")
    .replace(/^@forge\b/i, "")
    .trim();
}

export function routeIntent(text: string): RoutedIntent {
  const cleaned = stripBotMention(text);
  const normalized = cleaned.toLowerCase();

  if (!normalized || /^(help|commands|what can you do)\b/.test(normalized)) {
    return { kind: "help" };
  }

  if (/\bsummarize\b/.test(normalized)) {
    return { kind: "summarize" };
  }

  if (/\bdetails\b/.test(normalized)) {
    return { kind: "details" };
  }

  if (/\bdocument\s+[a-z][a-z0-9_-]*\b/.test(normalized)) {
    return { kind: "document", rawText: cleaned };
  }

  if (/\b(monthly )?metrics\b/.test(normalized) && !/\bstatus\b/.test(normalized)) {
    return { kind: "document", rawText: `document monthly_metrics ${cleaned}` };
  }

  if (/\btemplates?\b/.test(normalized) && /\b(list|install)\b/.test(normalized)) {
    return { kind: "template", rawText: cleaned };
  }

  if (/\btemplates\b/.test(normalized)) {
    return { kind: "template", rawText: cleaned };
  }

  if (/\bbrand\b/.test(normalized) && /\b(for|from|use|extract|clear)\b/.test(normalized)) {
    return { kind: "brand", rawText: cleaned };
  }

  if (/\btemplate\b/.test(normalized) && /\b(scaffold|list|studio|register)\b/.test(normalized)) {
    return { kind: "template", rawText: cleaned };
  }

  const workflow = findWorkflowByText(normalized);
  if (workflow) {
    return { kind: "workflow", workflowId: workflow.id, rawText: cleaned };
  }

  return { kind: "unknown", rawText: cleaned };
}
