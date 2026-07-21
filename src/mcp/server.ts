import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as service from "../service.js";
import { getTemplateReadme, getTemplateSample } from "../templates/registry.js";

const TOOL_DESCRIPTION_CREATE = `Creates a document from template + validated JSON data.
Returns document_id (required for compile, preview, export). Expires after 24h idle.
WHEN TO USE: After docforge_get_template_schema, when structured data is ready.
ON FAILURE: schema_error with agent_action — fix fields before compile.`;

export async function startMcpServer(): Promise<void> {
  await service.initService();

  const server = new McpServer({ name: "docforge", version: "0.7.0" });

  server.registerTool(
    "docforge_list_templates",
    {
      description:
        "List available DocForge templates with id, version, description, page budget, and required inputs. Use first to pick a template.",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [
        { type: "text", text: JSON.stringify(await service.docforgeListTemplates(), null, 2) },
      ],
    }),
  );

  server.registerTool(
    "docforge_get_template_schema",
    {
      description:
        "Return JSON Schema, README, and sample data for a template. Most important tool — teaches the agent what JSON to produce.",
      inputSchema: z.object({
        template_id: z.string().describe("Template id from docforge_list_templates"),
        version: z.string().optional().describe("Pin specific template version (semver)"),
      }),
    },
    async ({ template_id, version }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            await service.docforgeGetTemplateSchema(template_id, version),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    "docforge_create_document",
    {
      description: TOOL_DESCRIPTION_CREATE,
      inputSchema: z.object({
        template_id: z.string(),
        data: z.record(z.unknown()),
        brand_id: z.string().optional().default("default"),
        options: z
          .object({
            accessibility: z.boolean().optional(),
            pdf_standard: z
              .enum(["ua-1", "a-2a"])
              .optional()
              .describe(
                "PDF compliance: ua-1 (accessibility) or a-2a (archival) — mutually exclusive",
              ),
            typst_snippets: z
              .record(z.string())
              .optional()
              .describe("Constrained plain-text snippet slots (footer_note, header_note)"),
          })
          .optional(),
        csv_attachment: z
          .string()
          .optional()
          .describe(
            "CSV text for monthly_metrics template — merged into data via csvToMonthlyMetricsData",
          ),
      }),
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.docforgeCreateDocument(input), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "docforge_compile_document",
    {
      description:
        "Compile document to PDF and PNG previews (synchronous). Returns compile_history, layout_issues, suggested_repairs on failure. For very large documents that may exceed a client timeout, use docforge_compile_document_async (MCP Tasks).",
      inputSchema: z.object({
        document_id: z.string(),
      }),
    },
    async ({ document_id }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.runCompileForDocument(document_id), null, 2),
        },
      ],
    }),
  );

  server.experimental.tasks.registerToolTask(
    "docforge_compile_document_async",
    {
      title: "Compile Document (async)",
      description:
        "Compile document via MCP Tasks — for large documents that may exceed a client timeout. Same result shape as docforge_compile_document. Poll the task for completion.",
      inputSchema: {
        document_id: z.string(),
      },
      execution: { taskSupport: "optional" },
    },
    {
      async createTask({ document_id }, { taskStore, taskRequestedTtl }) {
        const task = await taskStore.createTask({ ttl: taskRequestedTtl });
        (async () => {
          try {
            const result = await service.runCompileForDocument(document_id);
            await taskStore.storeTaskResult(task.taskId, result.success ? "completed" : "failed", {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            });
          } catch (err) {
            await taskStore.storeTaskResult(task.taskId, "failed", {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: false,
                      document_id,
                      message: err instanceof Error ? err.message : String(err),
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            });
          }
        })();
        return { task };
      },
      async getTask(_args, { taskId, taskStore }) {
        const task = await taskStore.getTask(taskId);
        return task!;
      },
      async getTaskResult(_args, { taskId, taskStore }) {
        return (await taskStore.getTaskResult(taskId)) as CallToolResult;
      },
    },
  );

  server.registerTool(
    "docforge_preview_document",
    {
      description:
        "Return page previews as base64 PNGs for visual QA before export. Requires prior compile.",
      inputSchema: z.object({
        document_id: z.string(),
        pages: z.array(z.number().int().positive()).optional(),
        dpi: z.number().int().positive().optional(),
      }),
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.docforgePreviewDocument(input), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "docforge_lint_document",
    {
      description:
        "Run lint checks (unfinished markers, empty sections, page budget, template rules). Always call before export. Returns suggested_repairs when fixes are available.",
      inputSchema: z.object({
        document_id: z.string(),
      }),
    },
    async ({ document_id }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.docforgeLintDocument(document_id), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "docforge_repair_document",
    {
      description:
        "Apply deterministic data repairs (rename_field, add_default, remove_empty_section, etc.). Does not compile — call docforge_compile_document after repairs.",
      inputSchema: z.object({
        document_id: z.string(),
        repairs: z
          .array(z.string())
          .describe(
            "Repair tokens e.g. rename_field:metrics→kpis, add_default:sections[2].title, remove_empty_section:1",
          ),
      }),
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.docforgeRepairDocument(input), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "docforge_export_document",
    {
      description: "Export final artifacts: pdf, typ, json, png_preview paths.",
      inputSchema: z.object({
        document_id: z.string(),
        formats: z.array(z.enum(["pdf", "typ", "json", "png_preview", "source_zip"])),
      }),
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.docforgeExportDocument(input), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "docforge_save_document_version",
    {
      description: "Snapshot current document data as a new document_version for comparison.",
      inputSchema: z.object({ document_id: z.string() }),
    },
    async ({ document_id }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.docforgeSaveDocumentVersion(document_id), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "docforge_compare_document_versions",
    {
      description: "Compare two document versions — returns data diff and section changes.",
      inputSchema: z.object({
        document_id: z.string(),
        from_version: z.number().int().positive(),
        to_version: z.number().int().positive(),
      }),
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.docforgeCompareDocumentVersions(input), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "docforge_upgrade_document_template",
    {
      description:
        "Refresh template Typst files in workspace to target version. Does not recompile.",
      inputSchema: z.object({
        document_id: z.string(),
        version: z.string().optional().describe("Target template semver; defaults to latest"),
      }),
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.docforgeUpgradeDocumentTemplate(input), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "docforge_visual_qa_document",
    {
      description:
        "Run visual QA on compiled previews — layout heuristics beyond lint. Returns findings with lint_missed flag for agent review.",
      inputSchema: z.object({ document_id: z.string() }),
    },
    async ({ document_id }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.docforgeVisualQADocument(document_id), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "docforge_list_marketplace_templates",
    {
      description: "List community templates from the DocForge marketplace catalog.",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.docforgeListMarketplaceTemplates(), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "docforge_register_custom_template",
    {
      description: "Register a user-supplied template package after schema validation.",
      inputSchema: z.object({
        template_id: z.string(),
        source_path: z.string().describe("Absolute path to template package directory"),
      }),
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.docforgeRegisterCustomTemplate(input), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "docforge_validate_template_package",
    {
      description:
        "Validate a template package (schema, sample, required files) without registering.",
      inputSchema: z.object({ source_path: z.string() }),
    },
    async ({ source_path }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.docforgeValidateTemplatePackage(source_path), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "docforge_generate_template_scaffold",
    {
      description: "Generate a minimal custom template package from field descriptions.",
      inputSchema: z.object({
        template_id: z.string(),
        name: z.string(),
        description: z.string(),
        output_path: z.string(),
        fields: z.array(
          z.object({
            name: z.string(),
            type: z.string(),
            required: z.boolean().optional(),
            description: z.string().optional(),
          }),
        ),
      }),
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.docforgeGenerateTemplateScaffold(input), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "docforge_extract_brand_kit",
    {
      description: "Extract a brand kit from logo path and/or color hints.",
      inputSchema: z.object({
        id: z.string(),
        name: z.string(),
        logo_path: z.string().optional(),
        footer: z.string().optional(),
        colors: z
          .object({
            primary: z.string().optional(),
            accent: z.string().optional(),
            muted: z.string().optional(),
          })
          .optional(),
      }),
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.docforgeExtractBrandKit(input), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "docforge_destroy_document",
    {
      description: "Release document workspace resources. Idempotent if already destroyed.",
      inputSchema: z.object({
        document_id: z.string(),
      }),
    },
    async ({ document_id }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await service.docforgeDestroyDocument(document_id), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "template-catalog",
    "docforge://templates",
    {
      description: "DocForge template catalog (id, version, description)",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "docforge://templates",
          mimeType: "application/json",
          text: JSON.stringify(await service.docforgeListTemplates(), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "template-readme",
    new ResourceTemplate("docforge://templates/{id}/readme", { list: undefined }),
    {
      description: "Template agent README documentation",
      mimeType: "text/markdown",
    },
    async (uri, { id }) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: await getTemplateReadme(String(id)),
        },
      ],
    }),
  );

  server.registerResource(
    "template-sample",
    new ResourceTemplate("docforge://templates/{id}/sample", { list: undefined }),
    {
      description: "Template sample JSON data",
      mimeType: "application/json",
    },
    async (uri, { id }) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(await getTemplateSample(String(id)), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "marketplace-catalog",
    "docforge://marketplace",
    {
      description: "DocForge marketplace template catalog (community templates)",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "docforge://marketplace",
          mimeType: "application/json",
          text: JSON.stringify(await service.docforgeListMarketplaceTemplates(), null, 2),
        },
      ],
    }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
