import type { Diagnostic } from "../errors.js";
import type { LintIssue } from "../lint/engine.js";

export type ForgePipelineStage = "create" | "compile" | "lint" | "preflight" | "export" | "preview";

export type ForgePipelineFailure = {
  stage: ForgePipelineStage;
  documentId?: string;
  diagnostic?: Diagnostic;
  issues?: LintIssue[];
};

export class ForgePipelineError extends Error {
  readonly failure: ForgePipelineFailure;

  constructor(failure: ForgePipelineFailure) {
    const message =
      failure.diagnostic?.message ??
      failure.issues
        ?.filter((i) => i.severity === "error")
        .map((i) => i.message)
        .join("; ") ??
      `Forge pipeline failed at ${failure.stage}`;
    super(message);
    this.name = "ForgePipelineError";
    this.failure = failure;
  }
}
