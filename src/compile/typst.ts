import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { COMPILE_TIMEOUT_MS, TYPST_BIN, VENDORED_PACKAGE_PATH } from "../config.js";
import { parseTypstStderr } from "./diagnostics.js";
import { compileDiagnostic, successDiagnostic, type Diagnostic } from "../errors.js";

const execFileAsync = promisify(execFile);

export type CompileResult = {
  success: boolean;
  diagnostics: Diagnostic[];
  page_count?: number;
  duration_ms: number;
  pdf_path?: string;
  preview_paths?: string[];
};

/**
 * Prepend `--package-path` so `@preview/*` imports resolve from the vendored
 * offline store first (no network). Skipped if the vendored dir is absent, so
 * dev machines fall back to Typst's default cache.
 */
function withPackagePath(args: string[]): string[] {
  if (!existsSync(VENDORED_PACKAGE_PATH)) return args;
  // args[0] is the typst subcommand ("compile"); insert the flag right after it.
  return [args[0]!, "--package-path", VENDORED_PACKAGE_PATH, ...args.slice(1)];
}

/**
 * Did this execFile rejection come from our abort timer (vs. a real Typst
 * compile error)? An aborted execFile surfaces as code "ABORT_ERR" — the
 * documented, version-stable signal. We also honor an already-aborted
 * controller and keep name/killed/signal as fallbacks. Exported for testing
 * because the detection branch is otherwise only reachable via a slow real
 * compile timeout.
 */
export function isAbortTimeoutError(err: unknown, signalAborted: boolean): boolean {
  const e = (err ?? {}) as { code?: string; killed?: boolean; signal?: string };
  return (
    signalAborted ||
    e.code === "ABORT_ERR" ||
    (err instanceof Error && err.name === "AbortError") ||
    Boolean(e.killed) ||
    e.signal === "SIGTERM" ||
    e.signal === "SIGABRT"
  );
}

async function runTypst(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COMPILE_TIMEOUT_MS);
  const env = { ...process.env };
  if (process.env.DOCFORGE_TYPST_PACKAGE_CACHE_PATH) {
    env.TYPST_PACKAGE_CACHE_PATH = process.env.DOCFORGE_TYPST_PACKAGE_CACHE_PATH;
  }
  try {
    const { stdout, stderr } = await execFileAsync(TYPST_BIN, withPackagePath(args), {
      cwd,
      signal: controller.signal,
      maxBuffer: 10 * 1024 * 1024,
      env,
    });
    return { stdout, stderr };
  } catch (err: unknown) {
    if (isAbortTimeoutError(err, controller.signal.aborted)) {
      throw Object.assign(new Error("compile timeout"), { code: "TIMEOUT" });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function compileDocumentWorkspace(
  workspace: string,
  options?: { pdfStandard?: string },
): Promise<CompileResult> {
  const start = Date.now();
  const mainTyp = path.join(workspace, "main.typ");
  const pdfPath = path.join(workspace, "output.pdf");
  const previewPattern = path.join(workspace, "preview-{p}.png");

  const compileArgs = ["compile", "--root", workspace];
  if (options?.pdfStandard) {
    compileArgs.push("--pdf-standard", options.pdfStandard);
  }
  compileArgs.push(mainTyp, pdfPath);

  try {
    await runTypst(compileArgs, workspace);

    await runTypst(
      ["compile", "--root", workspace, "--format", "png", "--ppi", "120", mainTyp, previewPattern],
      workspace,
    );

    const files = await readdir(workspace);
    const previews = files.filter((f) => f.startsWith("preview-") && f.endsWith(".png")).sort();
    const page_count = previews.length || 1;

    return {
      success: true,
      diagnostics: [successDiagnostic("typst_compile", "PDF and previews generated")],
      page_count,
      duration_ms: Date.now() - start,
      pdf_path: pdfPath,
      preview_paths: previews.map((f) => path.join(workspace, f)),
    };
  } catch (err: unknown) {
    const e = err as { code?: string; stderr?: string };
    if (e.code === "TIMEOUT") {
      return {
        success: false,
        diagnostics: [
          compileDiagnostic("Compilation exceeded timeout limit", {
            error_type: "timeout_error",
            agent_action: "Reduce document size or complexity and retry compile.",
            retryable: true,
          }),
        ],
        duration_ms: Date.now() - start,
      };
    }

    const stderr = typeof e.stderr === "string" ? e.stderr : String(err);
    const diagnostic = parseTypstStderr(stderr);
    if (
      options?.pdfStandard?.toLowerCase().includes("ua") &&
      /accessib|pdf.?ua|tagged|alt.?text|structure/i.test(stderr)
    ) {
      diagnostic.error_type = "accessibility_error";
      diagnostic.stage = "export";
      diagnostic.agent_action =
        "Fix accessibility issues: document title, heading hierarchy, alt text on figures. Recompile with accessibility fixes.";
    }
    return {
      success: false,
      diagnostics: [diagnostic],
      duration_ms: Date.now() - start,
    };
  }
}

export async function assertTypstAvailable(): Promise<string> {
  const { stdout } = await execFileAsync(TYPST_BIN, ["--version"]);
  return stdout.trim();
}
