import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { compileBrandThemeTyp } from "../brand/compiler.js";
import { mergeBrandTheme } from "../brand/merge.js";
import { getBrandKitDir } from "../brand/registry.js";
import { DOCFORGE_PACKAGES_ROOT } from "../config.js";
import type { BrandKit } from "../brand/types.js";

export async function createDocumentWorkspace(
  documentsRoot: string,
  templateDir: string,
  brand?: BrandKit,
): Promise<string> {
  const documentId = `doc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const workspace = path.join(documentsRoot, documentId);
  await mkdir(workspace, { recursive: true });
  await mkdir(path.join(workspace, "assets"), { recursive: true });

  let hasLogo = false;
  if (brand?.logo) {
    const logoSrc = path.join(getBrandKitDir(brand.id), brand.logo);
    const logoDest = path.join(workspace, "assets", brand.logo);
    try {
      await cp(logoSrc, logoDest);
      hasLogo = true;
    } catch {
      hasLogo = false;
    }
  }

  for (const file of ["main.typ", "components.typ"]) {
    await cp(path.join(templateDir, file), path.join(workspace, file));
  }

  if (brand) {
    const templateTheme = await readFile(path.join(templateDir, "theme.typ"), "utf8");
    const brandBlock = compileBrandThemeTyp(brand, hasLogo);
    await writeFile(
      path.join(workspace, "theme.typ"),
      mergeBrandTheme(brandBlock, templateTheme),
      "utf8",
    );
  } else {
    await cp(path.join(templateDir, "theme.typ"), path.join(workspace, "theme.typ"));
  }

  const pkgDest = path.join(workspace, "docforge");
  await mkdir(pkgDest, { recursive: true });
  try {
    for (const file of await readdir(DOCFORGE_PACKAGES_ROOT)) {
      if (file.endsWith(".typ")) {
        await cp(path.join(DOCFORGE_PACKAGES_ROOT, file), path.join(pkgDest, file));
      }
    }
  } catch {
    // packages optional for Wave 0-2 templates
  }

  return workspace;
}

export async function writeDocumentData(
  workspace: string,
  data: Record<string, unknown>,
): Promise<void> {
  await writeFile(path.join(workspace, "data.json"), JSON.stringify(data, null, 2), "utf8");
}
