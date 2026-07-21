#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateRoots = [path.join(root, "templates"), path.join(root, "marketplace")];

let failed = false;

for (const templatesRoot of templateRoots) {
  let entries;
  try {
    entries = await readdir(templatesRoot, { withFileTypes: true });
  } catch {
    continue;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(templatesRoot, entry.name);
    const required = ["template.json", "schema.json", "sample.json", "main.typ"];
    for (const file of required) {
      try {
        await readFile(path.join(dir, file));
      } catch {
        console.error(`Missing ${file} in ${dir}`);
        failed = true;
      }
    }

    try {
      const meta = JSON.parse(await readFile(path.join(dir, "template.json"), "utf8"));
      const sample = JSON.parse(await readFile(path.join(dir, "sample.json"), "utf8"));
      if (meta.id !== entry.name) {
        console.error(`template.json id "${meta.id}" != directory "${entry.name}" in ${dir}`);
        failed = true;
      }
      if (!sample.title && !Object.keys(sample).length) {
        console.error(`sample.json appears empty in ${dir}`);
        failed = true;
      }
    } catch (err) {
      console.error(`Invalid template package in ${dir}: ${err.message}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("Template schema/sample sync check passed.");
