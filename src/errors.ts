import { sanitizeHostPaths } from "./security/paths.js";

export type ErrorType =
  | "schema_error"
  | "template_error"
  | "compile_error"
  | "asset_error"
  | "layout_warning"
  | "accessibility_warning"
  | "accessibility_error"
  | "math_error"
  | "budget_error"
  | "timeout_error";

export type Diagnostic = {
  success: boolean;
  error_type?: ErrorType;
  stage: string;
  message: string;
  location?: { path?: string; field?: string; file?: string; line?: number; column?: number };
  agent_action?: string;
  retryable?: boolean;
  repair_available?: boolean;
  suggested_repairs?: string[];
};

export function schemaDiagnostic(message: string, opts: Partial<Diagnostic> = {}): Diagnostic {
  return {
    success: false,
    error_type: "schema_error",
    stage: "validation",
    message,
    agent_action:
      opts.agent_action ??
      "Fix the data fields listed in the message to match the template schema.",
    retryable: true,
    repair_available: false,
    ...opts,
  };
}

export function compileDiagnostic(message: string, opts: Partial<Diagnostic> = {}): Diagnostic {
  return {
    success: false,
    error_type: "compile_error",
    stage: "typst_compile",
    message,
    agent_action: opts.agent_action ?? "Review compile diagnostics and fix data or request repair.",
    retryable: true,
    repair_available: opts.repair_available ?? false,
    ...opts,
  };
}

export function successDiagnostic(stage: string, message = "OK"): Diagnostic {
  return { success: true, stage, message };
}

/** Strip host filesystem paths from diagnostics before agent-facing responses. */
export function sanitizeDiagnostic(d: Diagnostic): Diagnostic {
  return {
    ...d,
    message: sanitizeHostPaths(d.message),
    agent_action: d.agent_action ? sanitizeHostPaths(d.agent_action) : d.agent_action,
    location: d.location
      ? {
          ...d.location,
          path: d.location.path ? sanitizeHostPaths(d.location.path) : d.location.path,
          file: d.location.file ? pathBasenameOnly(d.location.file) : d.location.file,
        }
      : d.location,
  };
}

function pathBasenameOnly(file: string): string {
  const parts = file.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? file;
}

export function sanitizeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.map(sanitizeDiagnostic);
}
