/** Deterministic layout repairs for preflight warnings — no new content invented. */
export function applyLayoutRepairs(data: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...data };

  if (typeof next.summary === "string" && next.summary.length > 400) {
    next.summary = `${next.summary.slice(0, 397)}…`;
  }
  if (typeof next.executive_summary === "string" && next.executive_summary.length > 400) {
    next.executive_summary = `${next.executive_summary.slice(0, 397)}…`;
  }
  if (typeof next.commentary === "string" && next.commentary.length > 600) {
    next.commentary = `${next.commentary.slice(0, 597)}…`;
  }
  if (Array.isArray(next.sections) && next.sections.length > 4) {
    next.sections = next.sections.slice(0, 4);
  }
  if (Array.isArray(next.kpis) && next.kpis.length > 12) {
    next.kpis = next.kpis.slice(0, 12);
  }
  if (Array.isArray(next.workstreams) && next.workstreams.length > 6) {
    next.workstreams = next.workstreams.slice(0, 6);
  }

  return next;
}
