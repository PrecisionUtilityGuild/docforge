import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentRecord, DocumentVersionSnapshot } from "../types.js";

function versionsDir(workspace: string): string {
  return path.join(workspace, "versions");
}

function versionPath(workspace: string, version: number): string {
  return path.join(versionsDir(workspace), `v${version}.json`);
}

export async function saveVersionSnapshot(doc: DocumentRecord): Promise<DocumentVersionSnapshot> {
  const snapshot: DocumentVersionSnapshot = {
    document_version: doc.document_version,
    template_id: doc.template_id,
    template_version: doc.template_version,
    data: structuredClone(doc.data),
    saved_at: new Date().toISOString(),
    preview_paths: doc.artifacts.previews ? [...doc.artifacts.previews] : undefined,
  };

  await mkdir(versionsDir(doc.workspace_path), { recursive: true });
  await writeFile(
    versionPath(doc.workspace_path, doc.document_version),
    JSON.stringify(snapshot, null, 2),
    "utf8",
  );
  return snapshot;
}

export async function loadVersionSnapshot(
  workspace: string,
  version: number,
): Promise<DocumentVersionSnapshot | undefined> {
  try {
    const raw = await readFile(versionPath(workspace, version), "utf8");
    return JSON.parse(raw) as DocumentVersionSnapshot;
  } catch {
    return undefined;
  }
}
