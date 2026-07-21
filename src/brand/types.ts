export type BrandKitColors = {
  primary: string;
  accent: string;
  muted: string;
  background: string;
  text: string;
};

export type BrandKitFonts = {
  heading: string;
  body: string;
  mono?: string;
};

export type BrandKit = {
  id: string;
  name: string;
  logo?: string | null;
  logo_alt?: string | null;
  colors: BrandKitColors;
  fonts: BrandKitFonts;
  footer: string;
  header?: string | null;
  tone?: string;
};

export const APPROVED_FONTS = [
  "Libertinus Serif",
  "New Computer Modern",
  "DejaVu Sans Mono",
  "DejaVu Sans",
] as const;
