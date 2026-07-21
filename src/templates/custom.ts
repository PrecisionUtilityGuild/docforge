import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataRoot, MARKETPLACE_ROOT, TEMPLATES_ROOT } from "../config.js";
import { assertSafeId, resolvePathInAllowedRoots, resolvePathUnderRoot } from "../security/paths.js";
import type { TemplateMeta } from "../types.js";
import { loadSchema, validateData } from "../validation/schema.js";

const CUSTOM_ROOT = () => path.join(getDataRoot(), "custom-templates");

export type TemplateSource = "builtin" | "custom" | "marketplace";

export type TemplateLocation = {
  id: string;
  dir: string;
  source: TemplateSource;
  meta: TemplateMeta;
};

const customIndex = new Map<string, TemplateLocation>();

async function readMeta(dir: string): Promise<TemplateMeta> {
  const raw = await readFile(path.join(dir, "template.json"), "utf8");
  return JSON.parse(raw) as TemplateMeta;
}

export async function validateTemplatePackage(sourcePath: string): Promise<{
  ok: boolean;
  errors: string[];
  meta?: TemplateMeta;
}> {
  let dir: string;
  try {
    dir = await resolvePathInAllowedRoots(sourcePath, "source_path");
  } catch (err) {
    return {
      ok: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  const errors: string[] = [];
  const required = ["template.json", "schema.json", "sample.json", "main.typ", "components.typ", "theme.typ"];
  for (const file of required) {
    try {
      await readFile(path.join(dir, file));
    } catch {
      errors.push(`Missing required file: ${file}`);
    }
  }
  if (errors.length) return { ok: false, errors };

  let meta: TemplateMeta;
  try {
    meta = await readMeta(dir);
  } catch {
    return { ok: false, errors: ["Invalid or missing template.json"] };
  }

  if (!meta.id || !meta.version) errors.push("template.json requires id and version");

  try {
    const schema = await loadSchema(dir);
    const sample = JSON.parse(await readFile(path.join(dir, "sample.json"), "utf8"));
    const validation = validateData(schema, sample);
    if (!validation.ok) errors.push(`sample.json fails schema: ${validation.diagnostic.message}`);
  } catch (err) {
    errors.push(`Schema/sample validation error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { ok: errors.length === 0, errors, meta };
}

export async function registerCustomTemplate(input: {
  template_id: string;
  source_path: string;
}): Promise<{ ok: boolean; template_id?: string; errors?: string[] }> {
  try {
    assertSafeId(input.template_id, "template_id");
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : String(err)] };
  }

  const validation = await validateTemplatePackage(input.source_path);
  if (!validation.ok || !validation.meta) {
    return { ok: false, errors: validation.errors };
  }

  let sourceDir: string;
  try {
    sourceDir = await resolvePathInAllowedRoots(input.source_path, "source_path");
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : String(err)] };
  }

  const id = input.template_id || validation.meta.id;
  let dest: string;
  try {
    dest = resolvePathUnderRoot(CUSTOM_ROOT(), id);
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : String(err)] };
  }
  await mkdir(dest, { recursive: true });

  const files = ["template.json", "schema.json", "sample.json", "main.typ", "components.typ", "theme.typ", "README.md", "lint_rules.json"];
  for (const file of files) {
    try {
      const content = await readFile(path.join(sourceDir, file));
      await writeFile(path.join(dest, file), content);
    } catch {
      // optional files skipped
    }
  }

  const meta = { ...validation.meta, id };
  await writeFile(path.join(dest, "template.json"), JSON.stringify(meta, null, 2), "utf8");

  customIndex.set(id, { id, dir: dest, source: "custom", meta });
  return { ok: true, template_id: id };
}

export async function resolveTemplateDir(
  templateId: string,
  source?: TemplateSource,
): Promise<string | undefined> {
  if (source === "custom" || customIndex.has(templateId)) {
    const custom = customIndex.get(templateId);
    if (custom) return custom.dir;
    try {
      assertSafeId(templateId, "template_id");
    } catch {
      return undefined;
    }
    const customDir = path.join(CUSTOM_ROOT(), templateId);
    try {
      await readFile(path.join(customDir, "template.json"));
      return customDir;
    } catch {
      return undefined;
    }
  }

  if (source === "marketplace") {
    try {
      assertSafeId(templateId, "template_id");
    } catch {
      return undefined;
    }
    return path.join(MARKETPLACE_ROOT, templateId);
  }

  try {
    assertSafeId(templateId, "template_id");
  } catch {
    return undefined;
  }

  const builtin = path.join(TEMPLATES_ROOT, templateId);
  try {
    await readFile(path.join(builtin, "template.json"));
    return builtin;
  } catch {
    // try marketplace fallback
  }

  const market = path.join(MARKETPLACE_ROOT, templateId);
  try {
    await readFile(path.join(market, "template.json"));
    return market;
  } catch {
    return undefined;
  }
}

export async function listCustomTemplates(): Promise<TemplateMeta[]> {
  const { readdir } = await import("node:fs/promises");
  const templates: TemplateMeta[] = [];
  const root = CUSTOM_ROOT();
  try {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const meta = await readMeta(path.join(root, entry.name));
        templates.push(meta);
        customIndex.set(meta.id, {
          id: meta.id,
          dir: path.join(root, entry.name),
          source: "custom",
          meta,
        });
      } catch {
        // skip invalid package
      }
    }
  } catch {
    return [];
  }
  return templates.sort((a, b) => a.id.localeCompare(b.id));
}

export async function installMarketplaceTemplate(
  templateId: string,
): Promise<{ ok: boolean; template_id?: string; errors?: string[] }> {
  try {
    assertSafeId(templateId, "template_id");
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : String(err)] };
  }

  const sourceDir = path.join(MARKETPLACE_ROOT, templateId);
  try {
    await readMeta(sourceDir);
  } catch {
    return { ok: false, errors: [`Marketplace template not found: ${templateId}`] };
  }

  return registerCustomTemplate({ template_id: templateId, source_path: sourceDir });
}

export async function listMarketplaceTemplates(): Promise<TemplateMeta[]> {
  const { readdir } = await import("node:fs/promises");
  const templates: TemplateMeta[] = [];
  try {
    for (const entry of await readdir(MARKETPLACE_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        templates.push(await readMeta(path.join(MARKETPLACE_ROOT, entry.name)));
      } catch {
        // skip
      }
    }
  } catch {
    return [];
  }
  return templates.sort((a, b) => a.id.localeCompare(b.id));
}

export function generateTemplateScaffold(input: {
  template_id: string;
  name: string;
  description: string;
  fields: Array<{ name: string; type: string; required?: boolean; description?: string }>;
}): { files: Record<string, string> } {
  const props: Record<string, object> = {};
  const required: string[] = [];
  for (const f of input.fields) {
    const typ = f.type === "array" ? { type: "array", items: { type: "string" } } : { type: "string" };
    props[f.name] = { ...typ, description: f.description ?? f.name };
    if (f.required) required.push(f.name);
  }

  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    required: required.length ? required : ["title"],
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 1 },
      ...props,
    },
  };

  const sample: Record<string, unknown> = { title: input.name };
  for (const f of input.fields) {
    sample[f.name] = f.type === "array" ? [`Sample ${f.name}`] : `Sample ${f.name}`;
  }

  const theme = `#let brand-primary = rgb("#111111")
#let brand-accent = rgb("#2563eb")
#let brand-muted = rgb("#64748b")
#let brand-background = rgb("#FFFFFF")
#let brand-text = rgb("#1A1A1A")
#let brand-footer = "${input.name}"
#let body-font = "Libertinus Serif"
#let heading-font = "Libertinus Serif"
#let brand-logo = none
#let brand-logo-alt = ""
#let brand-header-bar() = []
`;

  const fieldRenders = input.fields
    .map((f) => `#if data.at("${f.name}", default: none) != none [\n  = ${f.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}\n  #data.${f.name}\n]`)
    .join("\n\n");

  const mainTyp = `#import "theme.typ": *
#import "components.typ": *

#let data = json("data.json")

#set document(title: data.title)
#set text(font: body-font, size: 11pt, fill: brand-primary)
#set page(
  margin: (x: 2cm, y: 2.2cm),
  footer: context [
    #align(center)[
      #text(size: 8pt, fill: brand-muted)[#brand-footer#if data.at("typst_snippets", default: none) != none and data.typst_snippets.at("footer_note", default: "") != "" [ · #data.typst_snippets.footer_note] · #counter(page).display()]
    ]
  ],
)

#brand-header-bar()
#align(center)[#text(size: 22pt, weight: "bold")[#data.title]]
#v(1em)
${fieldRenders}
`;

  return {
    files: {
      "template.json": JSON.stringify(
        {
          id: input.template_id,
          version: "1.0.0",
          name: input.name,
          description: input.description,
          category: "custom",
          typst_version: ">=0.14.0",
          packages: {},
          page_budget: { min: 1, max: 10 },
          inputs: Object.keys(sample),
          outputs: ["pdf", "png_preview"],
        },
        null,
        2,
      ),
      "schema.json": JSON.stringify(schema, null, 2),
      "sample.json": JSON.stringify(sample, null, 2),
      "theme.typ": theme,
      "components.typ": '#import "theme.typ": *\n',
      "main.typ": mainTyp,
      "README.md": `# ${input.name}\n\n${input.description}\n\nGenerated scaffold — customize components.typ and main.typ before production use.\n`,
      "lint_rules.json": JSON.stringify({ checks: [] }, null, 2),
    },
  };
}
