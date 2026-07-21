import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDataRoot, PACKAGE_ROOT } from "../config.js";

const ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

/** Agent-safe identifier (template_id, brand_id, document_id prefix). */
export function assertSafeId(id: string, label = "id"): void {
  if (!ID_PATTERN.test(id)) {
    throw new Error(
      `Invalid ${label}: must match ${ID_PATTERN.source} (lowercase alphanumeric, underscore, hyphen).`,
    );
  }
}

function allowedSourceRoots(): string[] {
  const roots = [getDataRoot(), PACKAGE_ROOT, path.join(PACKAGE_ROOT, "brand_kits"), tmpdir()];
  const extra = process.env.DOCFORGE_TEMPLATE_SOURCE_DIRS;
  if (extra) {
    for (const entry of extra.split(path.delimiter)) {
      const trimmed = entry.trim();
      if (trimmed) roots.push(path.resolve(trimmed));
    }
  }
  return roots;
}

/** Resolve user path and ensure it stays within one of the allowed roots. */
export async function resolvePathInAllowedRoots(userPath: string, label = "path"): Promise<string> {
  const resolved = path.resolve(userPath);
  let real: string;
  try {
    real = await realpath(resolved);
  } catch {
    throw new Error(`${label} not found or not accessible.`);
  }

  for (const root of allowedSourceRoots()) {
    let realRoot: string;
    try {
      realRoot = await realpath(root);
    } catch {
      continue;
    }
    if (real === realRoot || real.startsWith(realRoot + path.sep)) {
      return real;
    }
  }

  throw new Error(
    `${label} must be under DocForge data root or an allowed template source directory.`,
  );
}

/** Ensure dest path stays within destRoot after joining with a safe id segment. */
export function resolvePathUnderRoot(destRoot: string, segment: string): string {
  assertSafeId(segment, "template_id");
  const dest = path.resolve(destRoot, segment);
  const root = path.resolve(destRoot);
  if (dest !== root && !dest.startsWith(root + path.sep)) {
    throw new Error("Path would escape intended directory.");
  }
  return dest;
}

/** Strip absolute host paths from agent-facing strings. */
export function sanitizeHostPaths(text: string): string {
  if (!text) return text;
  let out = text.replace(
    /(?:\/Users\/[^\s:'"]+|\/home\/[^\s:'"]+|\/tmp\/[^\s:'"]+|C:\\[^\s:'"]+)/gi,
    "<path>",
  );
  out = out.replace(/\b[A-Za-z]:\\[^\s:'"]+/g, "<path>");
  return out;
}

/** Return workspace-relative artifact name for agent responses. */
export function workspaceArtifactRef(filename: string): string {
  return path.basename(filename);
}
