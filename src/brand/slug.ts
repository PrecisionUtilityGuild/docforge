/** Safe brand_id from a display name (e.g. "Acme Corp" → "acme-corp"). */
export function slugBrandId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (slug || "brand").slice(0, 48);
}
