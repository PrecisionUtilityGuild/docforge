import type { KnownBlock } from "@slack/web-api";
import type { ForgeBuildReceipt, ForgePipelineStep } from "../../forge/receipt.js";

const STEP_ICON: Record<ForgePipelineStep["status"], string> = {
  passed: "✓",
  warning: "⚠",
  failed: "✗",
  running: "…",
  pending: "○",
  skipped: "–",
};

function formatStepLine(step: ForgePipelineStep): string {
  const icon = STEP_ICON[step.status];
  return `${icon} ${step.summary}`;
}

export function formatPipelineStatusText(receipt: ForgeBuildReceipt): string {
  const lines = [`*Forge Build #${receipt.build_id}*`, ...receipt.pipeline.map(formatStepLine)];
  if (receipt.repairs.count > 0) {
    lines.push(`_Repairs applied: ${receipt.repairs.applied.join(", ")}_`);
  }
  if (receipt.version_diff) {
    lines.push(`_Revision: ${receipt.version_diff.summary}_`);
  }
  lines.push(
    `_Transport: ${receipt.transport.path === "mcp" ? "DocForge MCP" : "DocForge in-process"} · ${receipt.total_duration_ms}ms total_`,
  );
  return lines.join("\n");
}

export function buildPipelineCardBlocks(input: {
  receipt: ForgeBuildReceipt;
  filename: string;
  finalizeId?: string;
  showApprovalActions?: boolean;
}): KnownBlock[] {
  const { receipt } = input;
  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Forge Build #${receipt.build_id}`, emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: receipt.pipeline.map(formatStepLine).join("\n"),
      },
    },
  ];

  const meta: string[] = [
    `*Template* \`${receipt.template.id}@${receipt.template.version}\``,
    `*Pages* ${receipt.compile.page_count}`,
    `*Compile* ${(receipt.compile.duration_ms / 1000).toFixed(1)}s`,
    `*Lint* ${receipt.lint.passed ? "pass" : "fail"} (${receipt.lint.warning_count} warning${receipt.lint.warning_count === 1 ? "" : "s"})`,
    `*Preflight* ${receipt.preflight.passed ? (receipt.preflight.warning_count > 0 ? "warnings" : "pass") : "fail"}`,
    `*Transport* ${receipt.transport.path === "mcp" ? "MCP" : "in-process"}`,
  ];

  if (receipt.sources.evidence_count !== undefined) {
    meta.push(`*Evidence* ${receipt.sources.evidence_count} snippet(s)`);
  }
  if (receipt.sources.confidence) {
    meta.push(`*Confidence* ${receipt.sources.confidence}`);
  }
  if (receipt.repairs.count > 0) {
    meta.push(`*Repairs* ${receipt.repairs.count}`);
  }
  if (receipt.version_diff) {
    meta.push(`*Changes* ${receipt.version_diff.summary}`);
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: meta.join(" · ") }],
  });

  if (receipt.preflight.warning_count > 0) {
    const warnings = receipt.preflight.findings
      .filter((f) => f.severity === "warning")
      .slice(0, 3)
      .map((f) => `• ${f.message}`)
      .join("\n");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Preflight warnings*\n${warnings}` },
    });
  }

  if (receipt.review.state === "final") {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text:
            `*Finalized* · \`${input.filename}\` · build #${receipt.build_id}` +
            (receipt.parent_build_id ? ` · supersedes #${receipt.parent_build_id}` : "") +
            (receipt.review.approved_by ? ` · approved by <@${receipt.review.approved_by}>` : ""),
        },
      ],
    });
    return blocks;
  }

  if (input.showApprovalActions && input.finalizeId) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*Delivered (DRAFT)* · \`${input.filename}\` · receipt \`${receipt.artifacts.receipt_basename}\``,
        },
      ],
    });
  }

  return blocks;
}

export function pipelineLoadingMessages(receipt: ForgeBuildReceipt): string[] {
  return receipt.pipeline
    .filter((s) => s.status === "passed" || s.status === "warning")
    .map((s) => formatStepLine(s));
}
