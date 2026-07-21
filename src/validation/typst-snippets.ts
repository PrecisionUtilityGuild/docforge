const MAX_SNIPPET_LEN = 500;

// Allowlist approach: snippet slots are plain prose. Reject Typst's active
// markup/code characters rather than chasing a denylist of keywords. `#` opens
// code/functions, `$` opens math, backtick opens raw, `<>` are labels, `\` is
// an escape, `@` starts references. Letters, digits, whitespace, and common
// punctuation/symbols (— – … © ® ™ € £ etc.) remain allowed.
const FORBIDDEN_CHARS = /[#$`<>\\@]/;

export function validateTypstSnippets(
  snippets: unknown,
): { ok: true } | { ok: false; message: string; agent_action: string } {
  if (snippets == null) return { ok: true };
  if (typeof snippets !== "object" || Array.isArray(snippets)) {
    return {
      ok: false,
      message: "typst_snippets must be an object with approved slot keys.",
      agent_action: "Use typst_snippets: { footer_note?: string } with plain text only.",
    };
  }

  const allowed = ["footer_note", "header_note", "cover_note"];
  const obj = snippets as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      return {
        ok: false,
        message: `typst_snippets.${key} is not an approved slot.`,
        agent_action: `Allowed slots: ${allowed.join(", ")}`,
      };
    }
    const val = obj[key];
    if (typeof val !== "string") {
      return {
        ok: false,
        message: `typst_snippets.${key} must be a string.`,
        agent_action: "Provide plain text for snippet slots.",
      };
    }
    if (val.length > MAX_SNIPPET_LEN) {
      return {
        ok: false,
        message: `typst_snippets.${key} exceeds ${MAX_SNIPPET_LEN} characters.`,
        agent_action: "Shorten snippet text.",
      };
    }
    if (FORBIDDEN_CHARS.test(val)) {
      return {
        ok: false,
        message: `typst_snippets.${key} contains Typst markup characters (one of # $ \` < > \\ @).`,
        agent_action:
          "Snippets are plain text only — remove # $ ` < > \\ @ and any Typst commands.",
      };
    }
  }

  return { ok: true };
}
