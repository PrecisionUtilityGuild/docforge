import { TYPST_VERSION_PIN } from "../config.js";
import { getSharedMcpClient } from "./mcp-client.js";

/**
 * Lightweight in-process metrics for the deployed agent. Reviewers test Forge
 * over a multi-week window with no dashboard, so a structured /health that
 * reports liveness plus recent compile success is the cheapest useful signal.
 * Counters are process-local (reset on restart) — fine for a single instance.
 */
type CompileVia = "mcp" | "in-process";

const counters = {
  startedAt: Date.now(),
  compileTotal: 0,
  compileSuccess: 0,
  compileFailure: 0,
  viaMcp: 0,
  viaInProcess: 0,
};

export function recordCompile(outcome: { ok: boolean; via?: CompileVia }): void {
  counters.compileTotal += 1;
  if (outcome.ok) counters.compileSuccess += 1;
  else counters.compileFailure += 1;
  if (outcome.via === "mcp") counters.viaMcp += 1;
  else if (outcome.via === "in-process") counters.viaInProcess += 1;
}

/** Reset counters — tests only. */
export function resetHealthMetrics(): void {
  counters.startedAt = Date.now();
  counters.compileTotal = 0;
  counters.compileSuccess = 0;
  counters.compileFailure = 0;
  counters.viaMcp = 0;
  counters.viaInProcess = 0;
}

export type HealthReport = {
  status: "ok" | "degraded";
  uptimeSeconds: number;
  typst: { pin: string };
  mcp: { connected: boolean; childPid: number | null; breakerOpen: boolean };
  compiles: {
    total: number;
    success: number;
    failure: number;
    successRate: number | null;
    viaMcp: number;
    viaInProcess: number;
  };
};

export function buildHealthReport(): HealthReport {
  const mcp = getSharedMcpClient();
  const total = counters.compileTotal;
  const successRate = total > 0 ? Number((counters.compileSuccess / total).toFixed(4)) : null;

  // "degraded" if the MCP breaker is open or recent compiles are mostly failing —
  // still serving (the in-process fallback works), but worth flagging to a watcher.
  const compilesUnhealthy = total >= 3 && successRate !== null && successRate < 0.5;
  const status: HealthReport["status"] = mcp.breakerOpen || compilesUnhealthy ? "degraded" : "ok";

  return {
    status,
    uptimeSeconds: Math.round((Date.now() - counters.startedAt) / 1000),
    typst: { pin: TYPST_VERSION_PIN },
    mcp: {
      connected: mcp.isConnected,
      childPid: mcp.childPid,
      breakerOpen: mcp.breakerOpen,
    },
    compiles: {
      total,
      success: counters.compileSuccess,
      failure: counters.compileFailure,
      successRate,
      viaMcp: counters.viaMcp,
      viaInProcess: counters.viaInProcess,
    },
  };
}
