#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const pin = process.env.TYPST_VERSION_PIN ?? "0.14.2";
const bin = process.env.DOCFORGE_TYPST_PATH ?? "typst";

const out = execFileSync(bin, ["--version"], { encoding: "utf8" }).trim();
const m = out.match(/(\d+)\.(\d+)\.(\d+)/);
if (!m) {
  console.error(`Could not parse Typst version from: ${out}`);
  process.exit(1);
}

const [, major, minor, patch] = m;
const [pinMajor, pinMinor, pinPatch] = pin.split(".").map(Number);

if (
  Number(major) < pinMajor ||
  (Number(major) === pinMajor && Number(minor) < pinMinor) ||
  (Number(major) === pinMajor && Number(minor) === pinMinor && Number(patch) < pinPatch)
) {
  console.error(`Typst ${out} is below pinned ${pin}`);
  process.exit(1);
}

console.log(`Typst version OK: ${out} (pin ${pin})`);
