export type TemplateMeta = {
  id: string;
  version: string;
  name: string;
  description: string;
  category: string;
  typst_version: string;
  page_budget: { min: number; max: number };
  inputs: string[];
  outputs: string[];
};

export type DocumentStatus =
  | "created"
  | "validated"
  | "compiling"
  | "compiled"
  | "linted"
  | "failed"
  | "destroyed";

export type LintResult = {
  check: string;
  severity: "error" | "warning" | "info";
  message: string;
  location?: string;
  agent_action?: string;
};

export type CompileAttempt = {
  attempt: number;
  success: boolean;
  page_count?: number;
  duration_ms?: number;
  diagnostics: import("./errors.js").Diagnostic[];
};

export type DocumentVersionSnapshot = {
  document_version: number;
  template_id: string;
  template_version: string;
  data: Record<string, unknown>;
  saved_at: string;
  preview_paths?: string[];
};

export type DocumentRecord = {
  document_id: string;
  template_id: string;
  template_version: string;
  document_version: number;
  brand_id: string;
  status: DocumentStatus;
  created_at: string;
  updated_at: string;
  data: Record<string, unknown>;
  options: { accessibility?: boolean; pdf_standard?: string };
  compile_history: CompileAttempt[];
  version_history: DocumentVersionSnapshot[];
  workspace_path: string;
  artifacts: {
    pdf?: string;
    previews?: string[];
    source_zip?: string;
  };
  warnings: string[];
};

export type CreateDocumentOptions = {
  accessibility?: boolean;
  pdf_standard?: string;
  typst_snippets?: Record<string, string>;
};
