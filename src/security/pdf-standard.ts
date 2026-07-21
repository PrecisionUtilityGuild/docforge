const ALLOWED = new Set(["ua-1", "a-2a"]);

export type PdfStandardValidation =
  | { ok: true; pdf_standard?: string; accessibility: boolean }
  | { ok: false; message: string; agent_action: string };

/** PDF/UA-1 and PDF/A-2a are mutually exclusive per Typst — one standard per export. */
export function validatePdfStandardOptions(options?: {
  accessibility?: boolean;
  pdf_standard?: string;
}): PdfStandardValidation {
  const raw = options?.pdf_standard?.trim().toLowerCase();
  if (!raw) {
    return { ok: true, accessibility: options?.accessibility ?? true };
  }

  if (!ALLOWED.has(raw)) {
    return {
      ok: false,
      message: `Unsupported pdf_standard "${options?.pdf_standard}". Allowed: ua-1, a-2a.`,
      agent_action:
        'Use pdf_standard "ua-1" for accessibility compliance or "a-2a" for archival — not both.',
    };
  }

  if (raw.includes(",") || /\s/.test(raw.replace(/^a-2a$|^ua-1$/, ""))) {
    return {
      ok: false,
      message: "pdf_standard accepts a single value — PDF/UA-1 and PDF/A cannot be combined.",
      agent_action: "Choose either ua-1 or a-2a for this document export.",
    };
  }

  const accessibility = options?.accessibility ?? true;
  if (raw === "a-2a" && accessibility) {
    return {
      ok: false,
      message: "PDF/A-2a export is incompatible with accessibility: true in the same request.",
      agent_action: 'Set options.accessibility to false when using pdf_standard "a-2a".',
    };
  }

  return { ok: true, pdf_standard: raw, accessibility };
}
