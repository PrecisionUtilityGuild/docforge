import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { extractBrandKit } from "../src/brand/extract.js";
import { getBrandKit, getBrandKitDir, loadAndValidateBrand } from "../src/brand/registry.js";
import { slugBrandId } from "../src/brand/slug.js";
import { docforgeExtractBrandKit, initService } from "../src/service.js";

let dataRoot = "";

describe("brand extraction and registry", () => {
  beforeEach(async () => {
    if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
    dataRoot = await mkdtemp(path.join(tmpdir(), "brand-registry-"));
    process.env.DOCFORGE_DATA_ROOT = dataRoot;
    await initService();
  });

  it("slugBrandId produces safe ids", () => {
    expect(slugBrandId("Acme Corp")).toBe("acme-corp");
    expect(slugBrandId("  ")).toBe("brand");
  });

  it("extractBrandKit sets logo_alt and WCAG-safe colors", async () => {
    const logoPath = path.join(dataRoot, "logo.png");
    // minimal PNG header + some colored bytes
    await writeFile(
      logoPath,
      Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77,
        0x53, 0xde, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf,
        0xc0, 0x00, 0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00,
        0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]),
    );

    const result = await extractBrandKit({
      id: "acme",
      name: "Acme Corp",
      logo_path: logoPath,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kit.logo_alt).toContain("Acme Corp");
    const { validateBrandKit } = await import("../src/brand/registry.js");
    expect(validateBrandKit(result.kit).ok).toBe(true);
  });

  it("docforgeExtractBrandKit persists under data root and resolves for compile", async () => {
    const extracted = await docforgeExtractBrandKit({
      id: "demo-co",
      name: "Demo Co",
      colors: { primary: "#111111", accent: "#2563eb" },
    });
    expect(extracted.success).toBe(true);

    const kit = await getBrandKit("demo-co");
    expect(kit.name).toBe("Demo Co");
    expect(getBrandKitDir("demo-co")).toContain(dataRoot);
    expect(await loadAndValidateBrand("demo-co")).toMatchObject({ ok: true });
  });

  it("still resolves package-shipped northstar brand", async () => {
    const kit = await getBrandKit("northstar");
    expect(kit.id).toBe("northstar");
    expect(kit.logo).toBe("logo.svg");
  });
});
