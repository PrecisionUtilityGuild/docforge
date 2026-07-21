export type FieldChange = {
  path: string;
  from: unknown;
  to: unknown;
};

export type SectionChange = {
  index: number;
  title?: { from: string; to: string };
  body_changed: boolean;
};

export type VersionDiff = {
  data_changes: FieldChange[];
  section_changes: SectionChange[];
  summary: string;
};

function walkDiff(a: unknown, b: unknown, prefix: string, changes: FieldChange[]): void {
  if (JSON.stringify(a) === JSON.stringify(b)) return;

  if (
    a == null ||
    b == null ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    changes.push({ path: prefix || "$", from: a, to: b });
    return;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      changes.push({ path: prefix, from: a.length, to: b.length });
    }
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      walkDiff(a[i], b[i], `${prefix}[${i}]`, changes);
    }
    return;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
  for (const key of keys) {
    walkDiff(aObj[key], bObj[key], prefix ? `${prefix}.${key}` : `$.${key}`, changes);
  }
}

export function diffSectionArrays(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): SectionChange[] {
  const changes: SectionChange[] = [];
  for (const key of ["sections", "findings", "agenda", "clauses"]) {
    const a = before[key];
    const b = after[key];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;

    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      const aSec = a[i] as Record<string, unknown> | undefined;
      const bSec = b[i] as Record<string, unknown> | undefined;
      if (!aSec || !bSec) {
        changes.push({ index: i, body_changed: true });
        continue;
      }
      const titleA = String(aSec.title ?? "");
      const titleB = String(bSec.title ?? "");
      const bodyA = String(aSec.body ?? aSec.description ?? aSec.text ?? "");
      const bodyB = String(bSec.body ?? bSec.description ?? bSec.text ?? "");
      if (titleA !== titleB || bodyA !== bodyB) {
        changes.push({
          index: i,
          title: titleA !== titleB ? { from: titleA, to: titleB } : undefined,
          body_changed: bodyA !== bodyB,
        });
      }
    }
  }
  return changes;
}

export function compareDocumentData(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): VersionDiff {
  const data_changes: FieldChange[] = [];
  walkDiff(before, after, "$", data_changes);
  const section_changes = diffSectionArrays(before, after);

  const parts: string[] = [];
  if (data_changes.length) parts.push(`${data_changes.length} field change(s)`);
  if (section_changes.length) parts.push(`${section_changes.length} section change(s)`);

  return {
    data_changes,
    section_changes,
    summary: parts.length ? parts.join(", ") : "No changes",
  };
}
