import { listCustomTemplates, installMarketplaceTemplate } from "../../templates/custom.js";
import { listTemplatesBySource } from "../../forge/document-router.js";
import { parseScaffoldCommand, scaffoldRegisterAndProve } from "../../templates/studio.js";
import { setWorkflowStatus } from "../agent/status.js";
import type { ForgeMessageContext } from "../types.js";

function parseInstallCommand(text: string): string | undefined {
  const match = text.match(/\btemplate\s+install\s+([a-z][a-z0-9_-]*)\b/i);
  return match?.[1]?.toLowerCase();
}

export async function runTemplateStudioWorkflow(
  ctx: ForgeMessageContext,
  commandText: string,
): Promise<void> {
  if (/\btemplates?\s+list\b/i.test(commandText) || /\btemplates\b/i.test(commandText)) {
    const grouped = await listTemplatesBySource();
    const sections = [
      `*Built-in (${grouped.builtin.length})*`,
      ...grouped.builtin.slice(0, 30).map((t) => `• \`${t.id}\` — ${t.name}`),
      grouped.builtin.length > 30 ? `_…and ${grouped.builtin.length - 30} more_` : "",
      "",
      `*Marketplace (${grouped.marketplace.length})*`,
      ...(grouped.marketplace.length
        ? grouped.marketplace.map(
            (t) => `• \`${t.id}\` — ${t.name} _(install: \`@forge template install ${t.id}\`)_`,
          )
        : ["_none bundled_"]),
      "",
      `*Custom (${grouped.custom.length})*`,
      ...(grouped.custom.length
        ? grouped.custom.map((t) => `• \`${t.id}\`@${t.version} — ${t.name}`)
        : ["_none yet — scaffold with `template scaffold`_"]),
      "",
      "Draft: `@forge draft using <id> …` · Explicit: `@forge document <id> …`",
    ].filter(Boolean);
    await ctx.say({
      text: sections.join("\n"),
      thread_ts: ctx.threadTs,
    });
    return;
  }

  const installId = parseInstallCommand(commandText);
  if (installId) {
    await setWorkflowStatus(ctx, `Installing ${installId}…`, ["Copying marketplace package…"]);
    const result = await installMarketplaceTemplate(installId);
    if (!result.ok) {
      await ctx.say({
        text: `Install failed: ${(result.errors ?? ["unknown error"]).join("; ")}`,
        thread_ts: ctx.threadTs,
      });
      return;
    }
    await ctx.say({
      text:
        `Installed marketplace template \`${result.template_id}\` to custom-templates.\n` +
        `Run \`@forge draft using ${result.template_id} …\` to use it.`,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  if (/\btemplate\s+list\b/i.test(commandText)) {
    const custom = await listCustomTemplates();
    if (!custom.length) {
      await ctx.say({
        text: 'No custom templates registered yet. Run `@forge template scaffold <id> --name "..." --fields summary,body`.',
        thread_ts: ctx.threadTs,
      });
      return;
    }
    const lines = custom.map((t) => `• \`${t.id}\`@${t.version} — ${t.name}`);
    await ctx.say({
      text: `*Custom templates*\n${lines.join("\n")}\n\nDraft with: \`@forge draft using <id> …\``,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  const parsed = parseScaffoldCommand(commandText);
  if (!parsed) {
    await ctx.say({
      text:
        "*Template Studio*\n" +
        "• `@forge templates` — full catalog (builtin / marketplace / custom)\n" +
        "• `@forge template install startup_pitch` — install marketplace template\n" +
        "• `@forge template list` — custom templates only\n" +
        '• `@forge template scaffold acme_brief --name "Acme Brief" --fields title,summary,body`\n' +
        "• `@forge draft using acme_brief <notes>` — produce a PDF from a custom template",
      thread_ts: ctx.threadTs,
    });
    return;
  }

  await setWorkflowStatus(ctx, "Scaffolding custom template…", [
    "Generating Typst package…",
    "Validating schema + sample…",
    "Compiling proof PDF…",
  ]);

  const result = await scaffoldRegisterAndProve(parsed);
  if (!result.success) {
    await ctx.say({
      text: `Template studio failed: ${(result.errors ?? ["unknown error"]).join("; ")}`,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  await ctx.say({
    text:
      `Registered custom template \`${result.template_id}\`.\n` +
      `• Proof compile: ${result.proof?.page_count ?? "?"} page(s), \`${result.proof?.pdf_basename}\`\n` +
      `• Package staged at \`${result.output_path}\`\n` +
      `Run \`@forge draft using ${result.template_id} <your notes>\` to use it in a workflow.`,
    thread_ts: ctx.threadTs,
  });
}
