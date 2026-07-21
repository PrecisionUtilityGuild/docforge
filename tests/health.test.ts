import { afterEach, describe, expect, it } from "vitest";
import { buildHealthReport, recordCompile, resetHealthMetrics } from "../src/forge/health.js";
import { TYPST_VERSION_PIN } from "../src/config.js";

afterEach(() => resetHealthMetrics());

describe("health report", () => {
  it("reports ok with no compiles and a null success rate", () => {
    const report = buildHealthReport();
    expect(report.status).toBe("ok");
    expect(report.typst.pin).toBe(TYPST_VERSION_PIN);
    expect(report.compiles.total).toBe(0);
    expect(report.compiles.successRate).toBeNull();
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("tracks success rate and pipeline split", () => {
    recordCompile({ ok: true, via: "mcp" });
    recordCompile({ ok: true, via: "in-process" });
    recordCompile({ ok: false });

    const report = buildHealthReport();
    expect(report.compiles).toMatchObject({
      total: 3,
      success: 2,
      failure: 1,
      viaMcp: 1,
      viaInProcess: 1,
    });
    expect(report.compiles.successRate).toBeCloseTo(0.6667, 3);
  });

  it("flags degraded when most recent compiles fail", () => {
    recordCompile({ ok: false });
    recordCompile({ ok: false });
    recordCompile({ ok: true, via: "in-process" });
    // 1/3 success < 0.5 over >=3 compiles → degraded (still 200 / still serving).
    expect(buildHealthReport().status).toBe("degraded");
  });

  it("stays ok below the degraded sample threshold", () => {
    recordCompile({ ok: false });
    recordCompile({ ok: false });
    // Only 2 samples — not enough to call it degraded.
    expect(buildHealthReport().status).toBe("ok");
  });
});
