import type { TranscriptLine } from "../slack/gather/transcript.js";
import { transcriptLinesToIncidentReport } from "./workflows.js";

/**
 * Blameless postmortem from incident channel transcript.
 * Extends incident_report mapping with retrospective fields.
 */
export function transcriptLinesToPostmortem(lines: TranscriptLine[]): Record<string, unknown> {
  const incident = transcriptLinesToIncidentReport(lines);
  const transcript = lines.map((l) => l.text).join("\n");

  const wentWell: string[] = [];
  const wentWrong: string[] = [];
  const lessons: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const text = line.text.trim();
    if (/\b(went well|worked|helped|effective|good call|shoutout)\b/i.test(text)) {
      const item = text.slice(0, 200);
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        wentWell.push(item);
      }
    }
    if (/\b(went wrong|failed|broke|missed|slow|confus|pain)\b/i.test(text)) {
      const item = text.slice(0, 200);
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        wentWrong.push(item);
      }
    }
    if (/\b(lesson|learned|takeaway|next time|should have|improve)\b/i.test(text)) {
      const item = text.slice(0, 200);
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        lessons.push(item);
      }
    }
  }

  return {
    title: "Blameless Postmortem",
    date: incident.date,
    severity: incident.severity,
    summary: incident.summary,
    timeline: incident.timeline,
    impact: incident.impact,
    root_cause: incident.root_cause,
    what_went_well:
      wentWell.length > 0
        ? wentWell.slice(0, 5)
        : ["Response coordination — confirm specifics before finalizing."],
    what_went_wrong:
      wentWrong.length > 0
        ? wentWrong.slice(0, 5)
        : ["Impact and detection gaps — confirm specifics before finalizing."],
    action_items: incident.actions,
    lessons_learned:
      lessons.length > 0
        ? lessons.slice(0, 5)
        : ["Capture lessons from the incident channel before final delivery."],
    evidence: transcript.slice(0, 2000),
  };
}

/** Route postmortem vs incident_report by command language and timeline depth. */
export function pickIncidentTemplate(
  commandText: string,
  lineCount: number,
): "incident_report" | "postmortem" {
  const lower = commandText.toLowerCase();
  if (/\bpostmortem\b/.test(lower) && !/\bincident report\b/.test(lower)) return "postmortem";
  if (/\b(blameless|retrospective|lessons learned)\b/.test(lower)) return "postmortem";
  if (lineCount >= 12 && /\b(lesson|went well|went wrong)\b/i.test(lower)) return "postmortem";
  return "incident_report";
}
