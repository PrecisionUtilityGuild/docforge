import { describe, expect, it } from "vitest";
import { isAbortTimeoutError } from "../src/compile/typst.js";

describe("compile timeout detection", () => {
  it("recognizes the real aborted-execFile shape (code ABORT_ERR)", () => {
    // What Node actually throws when an execFile signal is aborted.
    const aborted = Object.assign(new Error("aborted"), {
      name: "AbortError",
      code: "ABORT_ERR",
    });
    expect(isAbortTimeoutError(aborted, false)).toBe(true);
  });

  it("treats an already-aborted controller as a timeout regardless of error shape", () => {
    // Belt-and-suspenders: if OUR timer aborted, it's a timeout even if the
    // surfaced error is opaque.
    expect(isAbortTimeoutError(new Error("anything"), true)).toBe(true);
  });

  it("still catches legacy killed/SIGTERM/SIGABRT shapes", () => {
    expect(isAbortTimeoutError({ killed: true }, false)).toBe(true);
    expect(isAbortTimeoutError({ signal: "SIGTERM" }, false)).toBe(true);
    expect(isAbortTimeoutError({ signal: "SIGABRT" }, false)).toBe(true);
  });

  it("does NOT misclassify a genuine compile error as a timeout", () => {
    // Typst syntax error: non-zero exit, stderr present, no abort.
    const compileErr = Object.assign(new Error("Command failed"), {
      code: 1,
      stderr: "error: unknown variable",
    });
    expect(isAbortTimeoutError(compileErr, false)).toBe(false);
  });

  it("is null/undefined safe", () => {
    expect(isAbortTimeoutError(null, false)).toBe(false);
    expect(isAbortTimeoutError(undefined, false)).toBe(false);
  });
});
