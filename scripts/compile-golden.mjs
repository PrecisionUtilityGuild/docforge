#!/usr/bin/env node
// Regenerate the committed golden-page1.png baseline (what visual-regression
// diffs against) for every template. Template list is derived from the registry
// so new templates are picked up automatically — no hardcoded list to drift. Run
// after intentional layout changes, then review the diff.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileDocumentWorkspace } from "../dist/compile/typst.js";
import { createDocumentWorkspace, writeDocumentData } from "../dist/sandbox/workspace.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Discover every template/marketplace package that has a sample.json. */
async function discoverTemplates() {
  const roots = [path.join(PACKAGE_ROOT, "templates"), path.join(PACKAGE_ROOT, "marketplace")];
  const found = [];
  for (const root of roots) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = path.join(root, e.name);
      try {
        await readFile(path.join(dir, "sample.json"), "utf8");
        found.push({ id: e.name, dir });
      } catch {
        // no sample.json → not a renderable template package
      }
    }
  }
  return found.sort((a, b) => a.id.localeCompare(b.id));
}

async function main() {
  const outRoot = path.join(PACKAGE_ROOT, ".golden-build");
  await mkdir(outRoot, { recursive: true });

  const templates = await discoverTemplates();
  let failures = 0;

  for (const { id, dir } of templates) {
    const sample = JSON.parse(await readFile(path.join(dir, "sample.json"), "utf8"));
    const workspace = await createDocumentWorkspace(outRoot, dir);
    await writeDocumentData(workspace, sample);

    const result = await compileDocumentWorkspace(workspace);
    if (!result.success) {
      console.error(`✗ ${id}`, result.diagnostics);
      failures += 1;
      continue;
    }

    const page1 = result.preview_paths?.[0];
    if (page1) {
      await writeFile(path.join(dir, "golden-page1.png"), await readFile(page1));
    }

    console.log(`✓ ${id} → golden-page1.png (${result.page_count} pages)`);
  }

  if (failures > 0) {
    console.error(`\n${failures} template(s) failed to compile.`);
    process.exit(1);
  }
  console.log(`\n${templates.length} templates regenerated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
