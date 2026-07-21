export type LintSeverity = "error" | "warning" | "info";

export type LintIssue = {
  check: string;
  severity: LintSeverity;
  message: string;
  location?: string;
  agent_action?: string;
};
