import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { docforgeCompileDocument, docforgeCreateDocument, initService } from "../src/service.js";
import { inferDraftDocument, stripDraftCommand } from "../src/slack/workflows/draft-inference.js";
import { loadSchema, validateData } from "../src/validation/schema.js";
import { templateDir } from "./helpers.js";

const NOW = new Date("2026-06-15T12:00:00Z");
let dataRoot = "";

async function expectSchemaValid(inference: ReturnType<typeof inferDraftDocument>) {
  const schema = await loadSchema(templateDir(inference.templateId));
  expect(validateData(schema, inference.draftData).ok).toBe(true);
}

describe("draft inference", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "forge-draft-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  it("strips draft command prefixes without stripping source notes", () => {
    expect(stripDraftCommand("<@U123> draft # Transformer Notes")).toBe("# Transformer Notes");
    expect(stripDraftCommand("make a pdf Decision: use MCP")).toBe("Decision: use MCP");
  });

  it("infers technical_note for short math notes and compiles", async () => {
    const inference = inferDraftDocument(
      `# Transformer Notes

Attention score:

$$ softmax(QK^T / sqrt(d_k))V $$

- Query/key matching finds relevant tokens
- Values carry content forward
Source: https://example.com/attention`,
      NOW,
    );

    expect(inference.templateId).toBe("technical_note");
    expect(inference.draftData.summary).toBe(
      "Query/key matching finds relevant tokens; Values carry content forward",
    );
    expect(JSON.stringify(inference.draftData)).not.toContain("[Equation extracted below]");
    expect(inference.draftData.references).toEqual([
      { citation: "Source", url: "https://example.com/attention" },
    ]);
    expect(inference.draftData.body_md).not.toContain("# Transformer Notes");
    expect(inference.draftData.body_md).not.toContain("Source:");
    expect(inference.draftData.body_md).not.toContain("Reference:");
    const equations = inference.draftData.equations as Array<{ latex: string }>;
    expect(equations[0].latex).toContain("\\operatorname{softmax}");
    expect(equations[0].latex).toContain("\\sqrt{d_k}");
    await expectSchemaValid(inference);
    const created = await docforgeCreateDocument({
      template_id: inference.templateId,
      data: inference.draftData,
    });
    expect(created.status).toBe("created");
    const compiled = await docforgeCompileDocument(created.document_id);
    expect(compiled.success).toBe(true);
  });

  it("extracts bracketed equations without leaving math fences in body text", async () => {
    const inference = inferDraftDocument(
      `# Ranking Note

Model score:

\\[ score = \\frac{clicks}{impressions} \\]

- Use the score for candidate ordering`,
      NOW,
    );

    expect(inference.templateId).toBe("technical_note");
    expect(inference.draftData.body_md).not.toContain("\\[");
    expect(inference.draftData.body_md).not.toContain("\\]");
    const equations = inference.draftData.equations as Array<{ latex: string }>;
    expect(equations[0].latex).toContain("\\frac");
    await expectSchemaValid(inference);
  });

  it("keeps equation-only notes schema-valid", async () => {
    const inference = inferDraftDocument(
      `# Scoring Formula

$$ score = \\frac{clicks}{impressions} $$`,
      NOW,
    );

    expect(inference.templateId).toBe("technical_note");
    expect(inference.draftData.body_md).toBe("Equation extracted below.");
    await expectSchemaValid(inference);
  });

  it("infers meeting_brief for agenda-style notes", async () => {
    const inference = inferDraftDocument(
      `# Launch Readiness
Attendees: Maya, Sam
Objective: align on launch blockers
- Review migration status
- Action: confirm support coverage
- Prep customer rollout notes`,
      NOW,
    );

    expect(inference.templateId).toBe("meeting_brief");
    await expectSchemaValid(inference);
  });

  it("infers decision_record for explicit decision notes", async () => {
    const inference = inferDraftDocument(
      `# Cache Strategy
Context: API latency spikes under batch load.
Decision: accept Redis-backed request caching.
Consequences: faster reads, explicit cache invalidation work.
- Alternative: database-only reads
- Alternative: CDN edge cache`,
      NOW,
    );

    expect(inference.templateId).toBe("decision_record");
    await expectSchemaValid(inference);
  });

  it("derives a concise title from a prose first line, not the whole sentence", () => {
    const inference = inferDraftDocument(
      "We shipped the Q3 release. Risk: onboarding still slow. Recommendation: add a wizard.",
      NOW,
    );
    expect(inference.draftData.title).toBe("DRAFT — We shipped the Q3 release");
  });

  it("keeps a short label line as the title and strips a trailing colon", () => {
    const inference = inferDraftDocument(
      "Standup agenda:\n- review backlog\n- on-call rotation",
      NOW,
    );
    expect(inference.draftData.title).toBe("DRAFT — Standup agenda");
  });

  it("strips a leading label (Abstract:) and dangling tail from the title", () => {
    const inference = inferDraftDocument(
      "Abstract: we studied caching. Findings: hit rate up.",
      NOW,
    );
    expect(inference.draftData.title).toBe("DRAFT — we studied caching");
  });

  it("does not title a document with a bare URL", () => {
    const inference = inferDraftDocument("https://example.com/important-doc", NOW);
    expect(inference.draftData.title).toBe("DRAFT — Forge Draft");
  });

  it("keeps the @forge command and Slack mentions out of memo body text", async () => {
    const inference = inferDraftDocument(
      "@forge make a pdf\n# Weekly Sync\nWe should align with <@U123> on the roadmap and reduce exec-review risk.",
      NOW,
    );
    const body = JSON.stringify(inference.draftData);
    expect(body).not.toMatch(/@forge/i);
    expect(body).not.toContain("<@U123>");
    expect(body).not.toContain("# Weekly Sync");
    await expectSchemaValid(inference);
  });

  it("does not list @forge as a meeting attendee (explicit or inferred)", () => {
    const explicit = inferDraftDocument(
      "Standup agenda:\n- review backlog\nAttendees: @forge, @alice, @bob\nAction: file ticket",
      NOW,
    );
    expect(explicit.draftData.attendees).not.toContain("@forge");
    expect(explicit.draftData.attendees).toContain("@alice");

    const inferred = inferDraftDocument(
      "@forge sync meeting\n- discuss launch with @alice and @bob\nworkshop prep",
      NOW,
    );
    expect(inferred.draftData.attendees).not.toContain("forge");
  });

  it("flags ambiguity when two strong template signals compete", () => {
    const inference = inferDraftDocument(
      "Decision pending on caching. Meeting agenda: discuss. Attendees listed. " +
        "Standup prep. Decided nothing yet, alternative options open.",
      NOW,
    );
    expect(inference.ambiguous).toBe(true);
    expect(inference.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("does not flag ambiguity for a clear single-intent note", () => {
    const inference = inferDraftDocument(
      "We decided to adopt Postgres over Mongo. Option A: Mongo. Option B: Postgres. Accepted.",
      NOW,
    );
    expect(inference.ambiguous).toBe(false);
    expect(inference.templateId).toBe("decision_record");
  });

  it("rebuilds against a forced template and treats it as a high-confidence choice", async () => {
    const source = "Decision pending on caching. Meeting agenda: discuss. Alternatives open.";
    const forced = inferDraftDocument(source, NOW, "meeting_brief");
    expect(forced.templateId).toBe("meeting_brief");
    expect(forced.confidence).toBe("high");
    expect(forced.ambiguous).toBe(false);
    await expectSchemaValid(forced);
  });

  it("falls back to executive_memo for general notes", async () => {
    const inference = inferDraftDocument(
      `# Weekly Update
- Revenue pipeline improved
- Risk: integration scope needs review
- Next step: schedule leadership review`,
      NOW,
    );

    expect(inference.templateId).toBe("executive_memo");
    await expectSchemaValid(inference);
  });
});
