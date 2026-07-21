import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { TEMPLATES_ROOT } from "../config.js";
import type { TemplateMeta } from "../types.js";
import { listCustomTemplates, listMarketplaceTemplates, resolveTemplateDir } from "./custom.js";

async function scanTemplatesRoot(root: string, source: TemplateMeta["category"] | string): Promise<TemplateMeta[]> {
  const templates: TemplateMeta[] = [];
  try {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const raw = await readFile(path.join(root, entry.name, "template.json"), "utf8");
        const meta = JSON.parse(raw) as TemplateMeta;
        templates.push({ ...meta, category: meta.category || String(source) });
      } catch {
        // skip
      }
    }
  } catch {
    // missing root
  }
  return templates;
}

export async function listTemplates(): Promise<TemplateMeta[]> {
  const builtin = await scanTemplatesRoot(TEMPLATES_ROOT, "builtin");
  const marketplace = await listMarketplaceTemplates();
  const custom = await listCustomTemplates();
  const merged = new Map<string, TemplateMeta>();
  for (const t of [...builtin, ...marketplace, ...custom]) merged.set(t.id, t);
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function getTemplate(
  templateId: string,
  version?: string,
): Promise<{
  meta: TemplateMeta;
  dir: string;
}> {
  const dir = await resolveTemplateDir(templateId);
  if (!dir) {
    throw new Error(`Template not found: ${templateId}. Use docforge_list_templates.`);
  }
  const raw = await readFile(path.join(dir, "template.json"), "utf8");
  const meta = JSON.parse(raw) as TemplateMeta;
  if (version && meta.version !== version) {
    throw new Error(
      `Template ${templateId} version ${version} not found (current: ${meta.version}).`,
    );
  }
  return { meta, dir };
}

export async function getTemplateSchema(templateId: string): Promise<object> {
  const { dir } = await getTemplate(templateId);
  return JSON.parse(await readFile(path.join(dir, "schema.json"), "utf8"));
}

export async function getTemplateReadme(templateId: string): Promise<string> {
  const { dir } = await getTemplate(templateId);
  return readFile(path.join(dir, "README.md"), "utf8");
}

export async function getTemplateSample(templateId: string): Promise<object> {
  const { dir } = await getTemplate(templateId);
  return JSON.parse(await readFile(path.join(dir, "sample.json"), "utf8"));
}
