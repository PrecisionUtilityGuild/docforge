import { describe, expect, it } from "vitest";
import { suggestRepairsFromVisualFindings } from "../src/repair/suggestions.js";
import type { DocumentRecord } from "../src/types.js";
import type { VisualQAFinding } from "../src/qa/visual.js";

function doc(data: Record<string, unknown>): DocumentRecord {
  return {
    document_id: "d1",
    template_id: "kpi_report",
    template_version: "1.0.0",
    document_version: 1,
    brand_id: "default",
    status: "compiled",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    data,
    options: {},
    compile_history: [{ attempt: 1, success: true, page_count: 8, diagnostics: [] }],
    version_history: [],
    workspace_path: "/tmp/ws",
    artifacts: { previews: ["/tmp/p1.png"] },
    warnings: [],
  };
}

describe("preflight repair suggestions", () => {
  it("maps cramped layout to reflow and truncate repairs", () => {
    const findings: VisualQAFinding[] = [
      {
        check: "cramped_layout",
        severity: "warning",
        message: "Page 1 cramped",
        agent_action: "reflow",
        lint_missed: true,
      },
    ];
    const repairs = suggestRepairsFromVisualFindings(
      findings,
      doc({
        summary: "x".repeat(500),
        sections: Array.from({ length: 8 }, (_, i) => ({ title: `S${i}`, body: "body" })),
      }),
    );
    expect(repairs).toContain("reflow_sections:4");
    expect(repairs).toContain("truncate_string:$.summary:400");
  });

  it("maps blank pages to remove_empty_section", () => {
    const repairs = suggestRepairsFromVisualFindings(
      [
        {
          check: "blank_pages",
          severity: "warning",
          message: "Page 2 blank",
          agent_action: "remove",
          lint_missed: true,
        },
      ],
      doc({ title: "Board", summary: "ok" }),
    );
    expect(repairs).toContain("remove_empty_section:0");
  });

  it("ignores informational findings", () => {
    const repairs = suggestRepairsFromVisualFindings(
      [
        {
          check: "agent_visual_review",
          severity: "info",
          message: "inspect manually",
          agent_action: "look",
          lint_missed: true,
        },
      ],
      doc({ title: "T", summary: "s" }),
    );
    expect(repairs).toHaveLength(0);
  });
});
