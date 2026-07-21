import path from "node:path";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getDataRoot, PACKAGE_ROOT } from "../config.js";

// Version from package.json so the client identity can't drift from the release.
const PACKAGE_VERSION: string = JSON.parse(
  readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
).version;
import type { Diagnostic } from "../errors.js";
import type { LintIssue } from "../lint/engine.js";
import type { VisualQAFinding } from "../qa/visual.js";

/**
 * Thin MCP client that drives the DocForge MCP server (dist/index.js) over a
 * stdio child process. This is the "Slack agent uses the MCP" path: the bot
 * orchestrates create → compile → lint → export via real MCP tool calls.
 *
 * The bot and the MCP server are co-located in the same container and share
 * DOCFORGE_DATA_ROOT, so the absolute PDF path is reconstructed from the
 * document_id the tools return — MCP itself only exposes a basename by design.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the compiled MCP server entry. When this module runs from dist/
 * (production), `../index.js` is correct. When tests execute TypeScript source
 * from src/, the server is still the compiled dist/index.js entry.
 * FORGE_MCP_SERVER_ENTRY overrides both.
 */
export function defaultServerEntry(): string {
  const fromEnv = process.env.FORGE_MCP_SERVER_ENTRY?.trim();
  if (fromEnv) return path.resolve(fromEnv);

  const parent = path.basename(path.resolve(__dirname, ".."));
  if (parent === "src") return path.resolve(__dirname, "..", "..", "dist", "index.js");
  return path.resolve(__dirname, "..", "index.js");
}

type ToolText = { content?: Array<{ type: string; text?: string }> };

function parseToolResult<T>(result: unknown): T {
  const text = (result as ToolText).content?.find((c) => c.type === "text")?.text;
  if (!text) {
    throw new Error("MCP tool returned no text content.");
  }
  return JSON.parse(text) as T;
}

/** Tunable resilience policy for the MCP child (overridable in tests). */
export type McpResilienceOptions = {
  /** Total tool-call attempts before giving up (1 = no retry). */
  maxAttempts?: number;
  /** Base backoff between retries; doubles each attempt. */
  backoffBaseMs?: number;
  /** Consecutive transport failures that trip the breaker open. */
  breakerThreshold?: number;
  /** How long the breaker stays open (failing fast) before a half-open probe. */
  breakerCooldownMs?: number;
};

const DEFAULT_RESILIENCE: Required<McpResilienceOptions> = {
  maxAttempts: 3,
  backoffBaseMs: 50,
  breakerThreshold: 3,
  breakerCooldownMs: 10_000,
};

/** Raised when the breaker is open — signals callers to use the in-process fallback. */
export class McpUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpUnavailableError";
  }
}

export class DocForgeMcpClient {
  private readonly serverEntry: string;
  private readonly policy: Required<McpResilienceOptions>;
  private client?: Client;
  private transport?: StdioClientTransport;
  private connecting?: Promise<void>;

  // Circuit breaker: after `breakerThreshold` consecutive transport failures we
  // stop spawn-thrashing a sick child and fail fast for `breakerCooldownMs`, so
  // producePdf falls straight through to the in-process path. After the cooldown
  // a single half-open probe decides whether to close or re-open the breaker.
  private consecutiveTransportFailures = 0;
  private breakerOpenUntil = 0;

  constructor(serverEntry: string = defaultServerEntry(), options: McpResilienceOptions = {}) {
    this.serverEntry = serverEntry;
    this.policy = { ...DEFAULT_RESILIENCE, ...options };
  }

  /** Breaker state, for observability/health. */
  get breakerOpen(): boolean {
    return Date.now() < this.breakerOpenUntil;
  }

  /** Spawn the MCP server child and connect. Idempotent and concurrency-safe. */
  async connect(): Promise<void> {
    if (this.client) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.spawn();
    try {
      await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  private async spawn(): Promise<void> {
    try {
      await access(this.serverEntry);
    } catch {
      throw new Error(`MCP server entry not found: ${this.serverEntry}`);
    }

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [this.serverEntry],
      env: { ...process.env } as Record<string, string>,
    });
    const client = new Client({ name: "forge-slack-agent", version: PACKAGE_VERSION });
    // If the child dies, drop our handles so the next call respawns.
    transport.onclose = () => {
      if (this.transport === transport) {
        this.client = undefined;
        this.transport = undefined;
      }
    };
    await client.connect(transport);
    this.client = client;
    this.transport = transport;
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.transport = undefined;
    if (client) await client.close();
  }

  /** PID of the live MCP child, or null if not connected. For tests/observability. */
  get childPid(): number | null {
    return this.transport?.pid ?? null;
  }

  /** Whether a child is currently connected. */
  get isConnected(): boolean {
    return this.client !== undefined;
  }

  private async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    // Breaker open → fail fast so callers use the in-process fallback instead of
    // waiting on a child that's been failing. One half-open probe is allowed once
    // the cooldown elapses (breakerOpen flips false), which closes or re-opens it.
    if (this.breakerOpen) {
      throw new McpUnavailableError(
        "MCP child unavailable (circuit breaker open) — using in-process fallback.",
      );
    }

    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.policy.maxAttempts; attempt++) {
      try {
        const result = await this.invokeTool(name, args);
        // A successful tool call (even an in-band failure response) means the
        // transport is healthy — reset the breaker.
        this.consecutiveTransportFailures = 0;
        return parseToolResult<T>(result);
      } catch (err) {
        lastErr = err;
        // Tool-level errors are deterministic — never retry, never trip the breaker.
        if (!isTransportError(err)) throw err;

        // Dead/sick child: drop handles so the next attempt respawns.
        await this.close().catch(() => undefined);
        this.recordTransportFailure();
        if (this.breakerOpen || attempt === this.policy.maxAttempts) break;
        await delay(this.policy.backoffBaseMs * 2 ** (attempt - 1));
      }
    }

    throw lastErr instanceof Error
      ? lastErr
      : new Error(`MCP tool ${name} failed after ${this.policy.maxAttempts} attempts.`);
  }

  /**
   * Single tool invocation against the live child (connect + callTool). Protected
   * so resilience tests can drive the retry/breaker logic with a fake transport
   * instead of spawning a real MCP child.
   */
  protected async invokeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.connect();
    return this.client!.callTool({ name, arguments: args });
  }

  private recordTransportFailure(): void {
    this.consecutiveTransportFailures += 1;
    if (this.consecutiveTransportFailures >= this.policy.breakerThreshold) {
      this.breakerOpenUntil = Date.now() + this.policy.breakerCooldownMs;
      // Allow one probe after cooldown by resetting the streak counter now.
      this.consecutiveTransportFailures = 0;
    }
  }

  createDocument(input: {
    template_id: string;
    data: Record<string, unknown>;
    brand_id?: string;
  }): Promise<{
    status: string;
    document_id?: string;
    missing_fields?: string[];
    diagnostic?: Diagnostic;
  }> {
    return this.call("docforge_create_document", input);
  }

  compileDocument(document_id: string): Promise<{
    success: boolean;
    diagnostics?: Diagnostic[];
    suggested_repairs?: string[];
    page_count?: number;
    duration_ms?: number;
  }> {
    return this.call("docforge_compile_document", { document_id });
  }

  repairDocument(document_id: string, repairs: string[]): Promise<unknown> {
    return this.call("docforge_repair_document", { document_id, repairs });
  }

  lintDocument(document_id: string): Promise<{
    success: boolean;
    issues?: LintIssue[];
    diagnostic?: Diagnostic;
  }> {
    return this.call("docforge_lint_document", { document_id });
  }

  exportDocument(
    document_id: string,
    formats: string[],
  ): Promise<{
    success: boolean;
    exports?: Record<string, string>;
    diagnostic?: Diagnostic;
  }> {
    return this.call("docforge_export_document", { document_id, formats });
  }

  visualQADocument(document_id: string): Promise<{
    success: boolean;
    findings?: VisualQAFinding[];
    diagnostic?: Diagnostic;
  }> {
    return this.call("docforge_visual_qa_document", { document_id });
  }

  destroyDocument(document_id: string): Promise<unknown> {
    return this.call("docforge_destroy_document", { document_id });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Connection/transport failures (dead child) — distinct from tool-level errors. */
function isTransportError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /connection closed|not connected|transport|ECONNRESET|EPIPE|write after end|stdin/i.test(
    msg,
  );
}

// Shared client: spawn the MCP server once and reuse it across all workflows,
// instead of paying the ~300ms node cold-start (and a process spawn) per
// @forge command. The client self-heals if the child dies.
let shared: DocForgeMcpClient | undefined;

export function getSharedMcpClient(): DocForgeMcpClient {
  if (!shared) shared = new DocForgeMcpClient();
  return shared;
}

/** Tear down the shared client (process shutdown / tests). */
export async function closeSharedMcpClient(): Promise<void> {
  const c = shared;
  shared = undefined;
  if (c) await c.close();
}

/**
 * Resolve the absolute on-disk PDF path for a compiled document, using the
 * shared data root. Valid because the bot and MCP server share DOCFORGE_DATA_ROOT.
 */
export function resolvePdfPath(documentId: string): string {
  return path.join(getDataRoot(), documentId, "output.pdf");
}
