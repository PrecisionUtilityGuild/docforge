import { readFile } from "node:fs/promises";
import type { LintIssue } from "../lint/engine.js";

const BLANK_THRESHOLD = 0.98;
const EDGE_DARK_RATIO = 0.15;

async function samplePngEdgeDensity(
  pngPath: string,
): Promise<{ blank: boolean; edgeDensity: number }> {
  const buf = await readFile(pngPath);
  if (buf.length < 24 || buf[0] !== 0x89) {
    return { blank: false, edgeDensity: 0 };
  }

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width === 0 || height === 0) return { blank: false, edgeDensity: 0 };

  const idatChunks: Buffer[] = [];
  let offset = 8;
  while (offset + 12 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    if (type === "IEND") break;
    if (type === "IDAT") idatChunks.push(buf.subarray(offset + 8, offset + 8 + len));
    offset += 12 + len;
  }

  if (!idatChunks.length) return { blank: false, edgeDensity: 0 };

  const compressed = Buffer.concat(idatChunks);
  let darkSamples = 0;
  let totalSamples = 0;

  const sampleStride = Math.max(1, Math.floor(compressed.length / 2000));
  for (let i = 0; i < compressed.length; i += sampleStride) {
    const byte = compressed[i]!;
    totalSamples++;
    if (byte < 32) darkSamples++;
  }

  const edgeDensity = totalSamples ? darkSamples / totalSamples : 0;
  const blank = edgeDensity < 1 - BLANK_THRESHOLD;
  return { blank, edgeDensity };
}

export async function analyzeLayoutHeuristics(
  previewPaths: string[],
  pageCount: number,
): Promise<LintIssue[]> {
  const issues: LintIssue[] = [];

  if (pageCount > previewPaths.length && previewPaths.length > 0) {
    issues.push({
      check: "preview_page_gap",
      severity: "warning",
      message: `Expected ${pageCount} preview pages but found ${previewPaths.length}.`,
      agent_action: "Recompile to regenerate all preview PNGs.",
    });
  }

  for (let i = 0; i < previewPaths.length; i++) {
    const pngPath = previewPaths[i]!;
    try {
      const { blank, edgeDensity } = await samplePngEdgeDensity(pngPath);
      if (blank) {
        issues.push({
          check: "blank_pages",
          severity: "warning",
          message: `Page ${i + 1} appears mostly blank (density ${(edgeDensity * 100).toFixed(1)}%).`,
          location: `preview-${i + 1}`,
          agent_action: "Remove empty sections or add content to avoid blank pages.",
        });
      } else if (edgeDensity > EDGE_DARK_RATIO && i < previewPaths.length - 1) {
        issues.push({
          check: "possible_overflow",
          severity: "warning",
          message: `Page ${i + 1} has high content density — possible overflow or cramped layout.`,
          location: `preview-${i + 1}`,
          agent_action: "Consider truncate_string, split_wide_table, or reduce section content.",
        });
      }
    } catch {
      // skip unreadable preview
    }
  }

  if (previewPaths.length >= 2) {
    issues.push({
      check: "orphan_heading_heuristic",
      severity: "info",
      message: "Review last page for orphan headings at page bottom (agent visual QA recommended).",
      location: `preview-${previewPaths.length}`,
      agent_action: "Use preview_document to inspect final page layout.",
    });
  }

  return issues;
}
