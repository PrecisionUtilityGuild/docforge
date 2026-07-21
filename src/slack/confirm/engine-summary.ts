import type { ForgeBuildReceipt } from "../../forge/receipt.js";
import { sourceCoverageScore } from "../../lint/grounding.js";

const NARRATIVE_KEYS = [
  "summary",
  "executive_summary",
  "abstract",
  "decision",
  "context",
  "commentary",
  "objective",
  "root_cause",
  "background",
] as const;

function truncateField(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function labelForKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Top schema fields for confirm cards — not a wall, max 3 lines. */
export function formatSchemaFieldPreview(draftData: Record<string, unknown>, max = 3): string {
  const lines: string[] = [];

  for (const key of NARRATIVE_KEYS) {
    if (lines.length >= max) break;
    const value = draftData[key];
    if (typeof value !== "string" || value.trim().length < 8) continue;
    lines.push(`*${labelForKey(key)}:* ${truncateField(value)}`);
  }

  if (lines.length < max) {
    const kpis = draftData.kpis as Array<{ name?: string; value?: string }> | undefined;
    if (kpis?.length) {
      const kpiLine = kpis
        .slice(0, 3)
        .map((k) => `${k.name ?? "KPI"} ${k.value ?? "—"}`)
        .join(" · ");
      lines.push(`*KPIs:* ${truncateField(kpiLine, 140)}`);
    }
  }

  if (lines.length < max) {
    const scope = draftData.scope as Array<{ item?: string }> | undefined;
    if (scope?.length) {
      lines.push(
        `*Scope:* ${truncateField(
          scope
            .slice(0, 2)
            .map((s) => s.item ?? "")
            .filter(Boolean)
            .join("; "),
        )}`,
      );
    }
  }

  if (lines.length < max) {
    const ws = draftData.workstreams as Array<{ name?: string; rag?: string }> | undefined;
    if (ws?.length) {
      lines.push(
        `*Workstreams:* ${ws
          .slice(0, 3)
          .map((w) => `${w.name ?? "—"} (${w.rag ?? "amber"})`)
          .join(" · ")}`,
      );
    }
  }

  return lines.slice(0, max).join("\n");
}

/** One-line engine proof for confirm cards (pre-compile). */
export function formatEnginePreviewLine(input: {
  templateId: string;
  draftData?: Record<string, unknown>;
  pageHint?: string;
}): string {
  const parts = [`schema ✓`, `\`${input.templateId}\``];
  if (input.draftData) {
    const coverage = sourceCoverageScore(input.draftData);
    if (coverage > 0) {
      parts.push(`coverage ${coverage.toFixed(2)}`);
    }
  }
  if (input.pageHint) parts.push(input.pageHint);
  parts.push("MCP");
  return parts.join(" · ");
}

/** Extend delivery summary with lint/transport proof without thread spam. */
export function formatEngineDeliverySuffix(receipt: ForgeBuildReceipt): string {
  const lint =
    receipt.lint.passed && receipt.lint.warning_count === 0
      ? "lint ✓"
      : receipt.lint.passed
        ? `lint ${receipt.lint.warning_count}w`
        : "lint fail";
  const transport = receipt.transport.path === "mcp" ? "MCP" : "in-process";
  const repairs =
    receipt.repairs.count > 0
      ? ` · ${receipt.repairs.count} repair${receipt.repairs.count === 1 ? "" : "s"}`
      : "";
  return ` · ${lint} · ${transport}${repairs}`;
}
