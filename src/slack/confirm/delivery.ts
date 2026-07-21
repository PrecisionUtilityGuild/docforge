import type { ForgeBuildReceipt } from "../../forge/receipt.js";
import { formatEngineDeliverySuffix } from "./engine-summary.js";

/** One-line human summary for a delivered PDF with compact engine proof. */
export function formatDeliverySummary(input: {
  filename: string;
  receipt: ForgeBuildReceipt;
  draft?: boolean;
}): string {
  const pages = input.receipt.compile.page_count;
  const prefix = input.draft !== false ? "DRAFT" : "Final";
  let line = `${prefix} · \`${input.filename}\` · ${pages} page${pages === 1 ? "" : "s"}`;
  const warnings = input.receipt.preflight.warning_count;
  if (warnings > 0) {
    line += ` · ${warnings} layout warning${warnings === 1 ? "" : "s"}`;
  }
  line += formatEngineDeliverySuffix(input.receipt);
  return line;
}
