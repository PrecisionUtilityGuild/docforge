import { compileDiagnostic, type Diagnostic } from "../errors.js";
import { sanitizeHostPaths } from "../security/paths.js";

export type ErrorMapping = {
  pattern: RegExp;
  message?: (match: RegExpMatchArray, stderr: string) => string;
  agent_action: string;
  repair?: string;
  error_type?: Diagnostic["error_type"];
};

export const TYpst_ERROR_MAPPINGS: ErrorMapping[] = [
  {
    pattern: /unknown variable:?\s*[`'"]?(\w+)[`'"]?/i,
    message: (m) => `Template references unknown data field \`${m[1]}\``,
    agent_action: "Rename the data key to match the template schema, or apply repair rename_field.",
    repair: "rename_field",
  },
  {
    pattern: /unknown variable/i,
    agent_action:
      "Check data field names match template schema; try repair rename_field if keys differ.",
    repair: "rename_field",
  },
  {
    pattern: /unknown field:?\s*[`'"]?(\w+)[`'"]?/i,
    message: (m) => `Unknown field \`${m[1]}\` in template data binding`,
    agent_action: "Remove or rename the field to match get_template_schema.",
    repair: "rename_field",
  },
  {
    pattern: /file not found:?\s*(.+)/i,
    message: (m) => `Asset file not found: ${m[1]?.trim()}`,
    agent_action: "Upload the asset to workspace assets/ or remove the reference from data.",
    error_type: "asset_error",
  },
  {
    pattern: /failed to read file/i,
    agent_action: "Ensure referenced asset exists in document workspace assets/ folder.",
    error_type: "asset_error",
  },
  {
    pattern: /no such file or directory/i,
    agent_action:
      "Missing file in workspace — verify asset paths and re-create document if needed.",
    error_type: "asset_error",
  },
  {
    pattern: /expected (string|integer|float|bool|array|dictionary|content)/i,
    agent_action: "Fix data type mismatch — field value must match template schema type.",
  },
  {
    pattern: /type mismatch/i,
    agent_action: "Correct field types per get_template_schema before recompiling.",
  },
  {
    pattern: /cannot cast/i,
    agent_action: "Data type incompatible with template — check numeric vs string fields.",
  },
  {
    pattern: /missing field:?\s*[`'"]?(\w+)[`'"]?/i,
    message: (m) => `Template expects required field \`${m[1]}\``,
    agent_action: "Add the missing field or apply add_default repair.",
    repair: "add_default",
  },
  {
    pattern: /missing argument/i,
    agent_action: "Template function call missing required argument — check data completeness.",
    repair: "add_default",
  },
  {
    pattern: /duplicate definitions?/i,
    agent_action: "Conflicting definitions in template — likely duplicate keys in data.",
    repair: "rename_field",
  },
  {
    pattern: /label .+ does not exist/i,
    agent_action: "Broken cross-reference in template — verify section structure in data.",
  },
  {
    pattern: /unknown font/i,
    agent_action: "Font unavailable — use brand kit default fonts or check theme.typ.",
    error_type: "template_error",
  },
  {
    pattern: /failed to load font/i,
    agent_action: "Font file missing from brand kit — switch to default brand or fix font path.",
    error_type: "asset_error",
  },
  {
    pattern: /package not found/i,
    agent_action: "Typst package missing from cache — internal template error; report to DocForge.",
    error_type: "template_error",
  },
  {
    pattern: /failed to download package/i,
    agent_action: "Package download failed — compile runs offline; verify package cache.",
    error_type: "template_error",
  },
  {
    pattern: /syntax error/i,
    agent_action:
      "Typst syntax error — document data is rendered via json() (where #, $, \\ are literal), so this is almost always malformed raw Typst in a typst_snippets value or a template issue. Review/remove the offending snippet.",
    error_type: "template_error",
  },
  {
    pattern: /unexpected (token|character)/i,
    agent_action:
      "Unexpected token — check typst_snippets for stray Typst commands/markup (they must be plain text) rather than escaping data fields.",
    error_type: "template_error",
  },
  {
    pattern: /unclosed (delimiter|parenthesis|brace|bracket)/i,
    agent_action: "Malformed content — check for unmatched brackets in text or LaTeX fields.",
  },
  {
    pattern: /division by zero/i,
    agent_action: "Chart or KPI calculation divides by zero — add non-zero denominators in data.",
  },
  {
    pattern: /out of range/i,
    agent_action: "Numeric value out of acceptable range — verify chart/KPI data bounds.",
  },
  {
    pattern: /array index out of bounds/i,
    agent_action: "Data array shorter than template expects — add items or remove empty sections.",
    repair: "remove_empty_section",
  },
  {
    pattern: /accessib|pdf.?ua|tagged|alt.?text|structure/i,
    agent_action:
      "Fix accessibility: document title, heading hierarchy, alt text on figures. Recompile after fixes.",
    error_type: "accessibility_error",
  },
  {
    pattern: /math|latex|mitex/i,
    agent_action: "Equation render failed — simplify LaTeX or remove unsupported commands.",
    error_type: "math_error",
  },
  {
    pattern: /timeout|timed out/i,
    agent_action: "Reduce document complexity or use async compile for large documents.",
    error_type: "timeout_error",
  },
  {
    pattern: /memory|stack overflow/i,
    agent_action: "Document too complex — split content or reduce table/chart size.",
    error_type: "budget_error",
  },
  {
    pattern: /page(s)? (limit|budget|exceed)/i,
    agent_action: "Document exceeds page budget — truncate content or split into appendix.",
    error_type: "budget_error",
    repair: "truncate_string",
  },
];

function buildSuggestedRepairs(mapping: ErrorMapping, stderr: string): string[] | undefined {
  if (!mapping.repair) return undefined;
  const repairs: string[] = [];

  if (mapping.repair === "rename_field") {
    const varMatch = stderr.match(/unknown variable:?\s*[`'"]?(\w+)[`'"]?/i);
    if (varMatch) repairs.push(`rename_field:${varMatch[1]}→`);
    else repairs.push("rename_field:oldKey→newKey");
  } else if (mapping.repair === "add_default") {
    const fieldMatch = stderr.match(/missing field:?\s*[`'"]?(\w+)[`'"]?/i);
    if (fieldMatch) repairs.push(`add_default:${fieldMatch[1]}`);
    else repairs.push("add_default:field");
  } else if (mapping.repair === "escape_text") {
    repairs.push("escape_text:$.summary");
  } else if (mapping.repair === "remove_empty_section") {
    repairs.push("remove_empty_section:0");
  } else if (mapping.repair === "truncate_string") {
    repairs.push("truncate_string:$.summary:500");
  } else {
    repairs.push(mapping.repair);
  }
  return repairs.length ? repairs : undefined;
}

export function parseTypstStderr(stderr: string): Diagnostic {
  const lineMatch = stderr.match(/(\S+\.typ):(\d+):(\d+)/);
  const sanitized = sanitizeHostPaths(stderr);
  const rawMessage =
    sanitized.trim().split("\n").filter(Boolean).slice(-3).join(" ") || "Typst compilation failed";
  const fileBasename = lineMatch?.[1]
    ? lineMatch[1].replace(/\\/g, "/").split("/").pop()
    : undefined;

  for (const mapping of TYpst_ERROR_MAPPINGS) {
    const match = sanitized.match(mapping.pattern);
    if (!match) continue;

    const message = sanitizeHostPaths(
      mapping.message ? mapping.message(match, sanitized) : rawMessage,
    );
    const suggested_repairs = buildSuggestedRepairs(mapping, sanitized);

    return compileDiagnostic(message, {
      error_type: mapping.error_type ?? "compile_error",
      location: lineMatch
        ? { file: fileBasename, line: Number(lineMatch[2]), column: Number(lineMatch[3]) }
        : undefined,
      agent_action: mapping.agent_action,
      repair_available: Boolean(suggested_repairs?.length),
      suggested_repairs,
    });
  }

  return compileDiagnostic(rawMessage, {
    location: lineMatch
      ? { file: fileBasename, line: Number(lineMatch[2]), column: Number(lineMatch[3]) }
      : undefined,
    agent_action: "Fix the issue indicated by the compiler and recompile.",
  });
}
