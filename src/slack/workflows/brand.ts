import { slugBrandId } from "../../brand/slug.js";
import { loadAndValidateBrand } from "../../brand/registry.js";
import { docforgeExtractBrandKit } from "../../service.js";
import { setWorkflowStatus } from "../agent/status.js";
import { downloadSlackLogoFile } from "../gather/images.js";
import { clearThreadBrand, setThreadBrand } from "../brand/thread-brand.js";
import type { ForgeMessageContext } from "../types.js";

function parseBrandUse(text: string): string | undefined {
  const match = text.match(/\bbrand\s+use\s+([a-z0-9_-]+)\b/i);
  return match?.[1]?.toLowerCase();
}

function parseBrandForName(text: string): string | undefined {
  const match = text.match(/\bbrand\s+(?:for|from|extract(?:\s+brand)?\s+for)\s+(.+)$/i);
  return match?.[1]?.replace(/<@[^>]+>/g, "").trim();
}

export async function runBrandWorkflow(
  ctx: ForgeMessageContext,
  commandText: string,
): Promise<void> {
  if (/\bbrand\s+clear\b/i.test(commandText)) {
    clearThreadBrand(ctx.replyChannelId, ctx.threadTs);
    await ctx.say({
      text: "Cleared thread brand — subsequent PDFs use the default theme until you set a brand again.",
      thread_ts: ctx.threadTs,
    });
    return;
  }

  const useId = parseBrandUse(commandText);
  if (useId) {
    const validation = await loadAndValidateBrand(useId);
    if (!validation.ok) {
      await ctx.say({
        text: `Unknown or invalid brand \`${useId}\`: ${validation.errors.join("; ")}`,
        thread_ts: ctx.threadTs,
      });
      return;
    }
    setThreadBrand({
      channelId: ctx.replyChannelId,
      threadTs: ctx.threadTs,
      brandId: useId,
      name: validation.kit.name,
    });
    await ctx.say({
      text:
        `Thread brand set to *${validation.kit.name}* (\`${useId}\`). ` +
        "The next PDF compile in this thread uses this brand kit (logo, colors, footer).",
      thread_ts: ctx.threadTs,
    });
    return;
  }

  const brandName = parseBrandForName(commandText);
  if (!brandName) {
    await ctx.say({
      text:
        "Usage:\n" +
        "• `@forge brand for Acme` + attach a logo image → extract colors and set thread brand\n" +
        "• `@forge brand use northstar` → use a saved brand kit\n" +
        "• `@forge brand clear` → revert to default",
      thread_ts: ctx.threadTs,
    });
    return;
  }

  await setWorkflowStatus(ctx, "Extracting brand kit…", [
    "Sampling logo colors…",
    "Validating WCAG contrast…",
  ]);

  const brandId = slugBrandId(brandName);
  let logoPath: string | undefined;
  try {
    logoPath = await downloadSlackLogoFile(ctx.client, ctx.files, brandId);
  } catch (err) {
    ctx.logger.error("logo download failed", err);
    await ctx.say({
      text: `Could not download logo: ${err instanceof Error ? err.message : String(err)}`,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  if (!logoPath) {
    await ctx.say({
      text: "Attach a logo image (PNG, SVG, JPEG, WebP) to this message when running `@forge brand for <name>`.",
      thread_ts: ctx.threadTs,
    });
    return;
  }

  const extracted = await docforgeExtractBrandKit({
    id: brandId,
    name: brandName,
    logo_path: logoPath,
    footer: `Confidential — ${brandName}`,
  });

  if (!extracted.success) {
    await ctx.say({
      text: `Brand extraction failed: ${extracted.message ?? "unknown error"}`,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  const validation = await loadAndValidateBrand(brandId);
  if (!validation.ok) {
    await ctx.say({
      text: `Brand kit extracted but failed validation: ${validation.errors.join("; ")}`,
      thread_ts: ctx.threadTs,
    });
    return;
  }

  setThreadBrand({
    channelId: ctx.replyChannelId,
    threadTs: ctx.threadTs,
    brandId,
    name: brandName,
  });

  const kit = extracted.kit!;
  await ctx.say({
    text:
      `Brand kit extracted for *${brandName}* (\`${brandId}\`).\n` +
      `• Primary \`${kit.colors.primary}\` · Accent \`${kit.colors.accent}\`\n` +
      `• Logo copied into brand kit workspace\n` +
      "Subsequent PDF compiles in this thread will merge this theme into Typst before compile.",
    thread_ts: ctx.threadTs,
  });
}
