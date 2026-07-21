import { stripSlackMarkup } from "../slack/gather/slack-markup.js";

/** Strip bot mention and imperative draft prefixes from Slack command text. */
export function stripDraftCommand(text: string): string {
  let cleaned = text.replace(/<@[A-Z0-9]+>/g, "").trim();
  cleaned = cleaned.replace(
    /^(?:please\s+)?(?:turn\s+this\s+into\s+a\s+pdf|make\s+a\s+pdf|make\s+pdf|draft|page|one[- ]pager|pdf|document|make)\b\s*[:\-–—]?\s*/i,
    "",
  );
  return cleaned.trim();
}

/** Remove `using <id>` / `with template <id>` clause from source notes. */
export function stripExplicitTemplatePrefix(text: string, templateId: string): string {
  const escaped = templateId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `\\b(?:using|with\\s+template)\\s+${escaped}\\b\\s*[\\-–—:]?\\s*`,
    "i",
  );
  return text.replace(pattern, "").trim();
}

export function stripExplicitTemplateClause(text: string): string {
  return text.replace(/\b(?:using|with\s+template)\s+[a-z][a-z0-9_-]*\b\s*[:\-–—]?\s*/i, "").trim();
}

/**
 * Normalize Slack source text before any mapper: command noise, markup, mentions.
 */
export function normalizeWorkflowSource(
  text: string,
  options?: { explicitTemplateId?: string },
): string {
  let cleaned = stripDraftCommand(text);
  cleaned = stripSlackMarkup(cleaned);
  if (options?.explicitTemplateId) {
    cleaned = stripExplicitTemplatePrefix(cleaned, options.explicitTemplateId);
  } else {
    cleaned = stripExplicitTemplateClause(cleaned);
  }
  return cleaned
    .replace(/<@[A-Z0-9]+>/g, "")
    .replace(/(^|\s)@forge\b/gi, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
