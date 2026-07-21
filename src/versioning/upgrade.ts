import { cp, readdir } from "node:fs/promises";
import path from "node:path";
import { DOCFORGE_PACKAGES_ROOT } from "../config.js";
import { getTemplate } from "../templates/registry.js";
import type { DocumentRecord } from "../types.js";

export async function refreshTemplateFiles(
  doc: DocumentRecord,
  targetVersion?: string,
): Promise<{ template_version: string }> {
  const { meta, dir } = await getTemplate(doc.template_id, targetVersion);

  for (const file of ["main.typ", "components.typ"]) {
    await cp(path.join(dir, file), path.join(doc.workspace_path, file));
  }

  const themeSrc = path.join(dir, "theme.typ");
  try {
    await cp(themeSrc, path.join(doc.workspace_path, "theme.typ"));
  } catch {
    // brand-merged theme preserved if template has no standalone theme
  }

  const pkgDest = path.join(doc.workspace_path, "docforge");
  try {
    for (const file of await readdir(DOCFORGE_PACKAGES_ROOT)) {
      if (file.endsWith(".typ")) {
        await cp(path.join(DOCFORGE_PACKAGES_ROOT, file), path.join(pkgDest, file));
      }
    }
  } catch {
    // optional packages
  }

  return { template_version: meta.version };
}
