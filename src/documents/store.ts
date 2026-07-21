import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DOCUMENT_TTL_MS, getDataRoot } from "../config.js";
import { schemaDiagnostic, type Diagnostic } from "../errors.js";
import type { DocumentRecord } from "../types.js";

const index = new Map<string, DocumentRecord>();

export async function ensureDataRoot(): Promise<void> {
  await mkdir(getDataRoot(), { recursive: true });
}

export function getDocument(documentId: string): DocumentRecord | undefined {
  return index.get(documentId);
}

export async function saveDocument(doc: DocumentRecord): Promise<void> {
  index.set(doc.document_id, doc);
  await mkdir(path.dirname(recordPath(doc.document_id)), { recursive: true });
  await writeFile(recordPath(doc.document_id), JSON.stringify(doc, null, 2), "utf8");
}

export async function loadDocument(documentId: string): Promise<DocumentRecord | undefined> {
  const cached = index.get(documentId);
  if (cached) return cached;
  try {
    const raw = await readFile(recordPath(documentId), "utf8");
    const parsed = JSON.parse(raw) as DocumentRecord;
    const doc: DocumentRecord = {
      ...parsed,
      document_version: parsed.document_version ?? 1,
      version_history: parsed.version_history ?? [],
    };
    index.set(documentId, doc);
    return doc;
  } catch {
    return undefined;
  }
}

function recordPath(documentId: string): string {
  return path.join(getDataRoot(), documentId, "record.json");
}

export function isDocumentExpired(doc: DocumentRecord): boolean {
  if (doc.status === "destroyed") return true;
  const idleMs = Date.now() - new Date(doc.updated_at).getTime();
  return idleMs > DOCUMENT_TTL_MS;
}

export function documentExpiredDiagnostic(documentId: string): Diagnostic {
  return schemaDiagnostic(`Document handle ${documentId} expired after idle TTL.`, {
    agent_action: "Create a new document with docforge_create_document.",
    retryable: false,
  });
}

export function requireDocument(documentId: string): DocumentRecord {
  const doc = index.get(documentId);
  if (!doc) {
    throw new Error(
      `Unknown document_id: ${documentId}. Create a document first with docforge_create_document.`,
    );
  }
  if (isDocumentExpired(doc)) {
    throw new Error(
      `Document ${documentId} expired. Create a new document with docforge_create_document.`,
    );
  }
  return doc;
}
