export type JsonPathSegment = string | number;

export function parseJsonPath(path: string): JsonPathSegment[] {
  const normalized = path.startsWith("$") ? path.slice(1) : path;
  if (!normalized) return [];

  const segments: JsonPathSegment[] = [];
  const re = /\.([^.[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) {
    if (match[1] !== undefined) segments.push(match[1]);
    else if (match[2] !== undefined) segments.push(Number(match[2]));
  }
  return segments;
}

export function getAtPath(root: unknown, segments: JsonPathSegment[]): unknown {
  let current = root;
  for (const seg of segments) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[seg];
  }
  return current;
}

export function setAtPath(
  root: Record<string, unknown>,
  segments: JsonPathSegment[],
  value: unknown,
): void {
  if (segments.length === 0) return;
  let current: Record<string, unknown> | unknown[] = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    const next = segments[i + 1]!;
    if (typeof seg === "number") {
      const arr = current as unknown[];
      if (arr[seg] == null || typeof arr[seg] !== "object") {
        arr[seg] = typeof next === "number" ? [] : {};
      }
      current = arr[seg] as Record<string, unknown> | unknown[];
    } else {
      const obj = current as Record<string, unknown>;
      if (obj[seg] == null || typeof obj[seg] !== "object") {
        obj[seg] = typeof next === "number" ? [] : {};
      }
      current = obj[seg] as Record<string, unknown> | unknown[];
    }
  }
  const last = segments[segments.length - 1]!;
  if (typeof last === "number") {
    (current as unknown[])[last] = value;
  } else {
    (current as Record<string, unknown>)[last] = value;
  }
}

export function deleteAtPath(root: Record<string, unknown>, segments: JsonPathSegment[]): boolean {
  if (segments.length === 0) return false;
  let current: Record<string, unknown> | unknown[] = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (current == null || typeof current !== "object") return false;
    current = (current as Record<string | number, unknown>)[seg] as
      | Record<string, unknown>
      | unknown[];
  }
  const last = segments[segments.length - 1]!;
  if (typeof last === "number") {
    const arr = current as unknown[];
    if (!Array.isArray(arr) || last < 0 || last >= arr.length) return false;
    arr.splice(last, 1);
    return true;
  }
  const obj = current as Record<string, unknown>;
  if (!(last in obj)) return false;
  delete obj[last];
  return true;
}

export function formatJsonPath(segments: JsonPathSegment[]): string {
  if (segments.length === 0) return "$";
  let out = "$";
  for (const seg of segments) {
    out += typeof seg === "number" ? `[${seg}]` : `.${seg}`;
  }
  return out;
}
