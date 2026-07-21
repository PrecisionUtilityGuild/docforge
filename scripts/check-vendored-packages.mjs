#!/usr/bin/env node
// Verify every @preview/<name>:<version> imported by templates/ and packages/
// is present in vendor/typst-packages/preview/<name>/<version>/ with a typst.toml.
// Guards against a template bumping a package version while the offline vendor
// store drifts — which would break compiles on a no-network reviewer container.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = path.join(ROOT, "vendor", "typst-packages", "preview");
const IMPORT_RE = /@preview\/([a-z0-9_-]+):([0-9]+\.[0-9]+\.[0-9]+)/g;

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".git", "vendor"].includes(entry.name)) continue;
      walk(full, acc);
    } else if (/\.(typ|json)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const required = new Map(); // "name:version" -> first file that referenced it
for (const dir of ["templates", "packages"]) {
  const base = path.join(ROOT, dir);
  if (!existsSync(base)) continue;
  for (const file of walk(base)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(IMPORT_RE)) {
      const key = `${m[1]}:${m[2]}`;
      if (!required.has(key)) required.set(key, path.relative(ROOT, file));
    }
  }
}

const problems = [];
for (const [key, referencedBy] of required) {
  const [name, version] = key.split(":");
  const pkgDir = path.join(VENDOR, name, version);
  const toml = path.join(pkgDir, "typst.toml");
  if (!existsSync(pkgDir) || !statSync(pkgDir).isDirectory()) {
    problems.push(`Missing vendored package @preview/${key} (referenced by ${referencedBy})`);
  } else if (!existsSync(toml)) {
    problems.push(
      `@preview/${key} present but missing typst.toml at ${path.relative(ROOT, pkgDir)}`,
    );
  }
}

if (required.size === 0) {
  console.log("No @preview/* imports found; nothing to vendor.");
  process.exit(0);
}

if (problems.length) {
  console.error("Vendored package check FAILED:");
  for (const p of problems) console.error("  - " + p);
  console.error(
    `\nVendor the missing version(s) into vendor/typst-packages/preview/<name>/<version>/ ` +
      `(copy from ~/.cache or Library/Caches typst packages).`,
  );
  process.exit(1);
}

console.log(`Vendored packages OK: ${[...required.keys()].map((k) => "@preview/" + k).join(", ")}`);
