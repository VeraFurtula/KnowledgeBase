/** Join `public/` paths with Vite `base` (subpath deploys). */
export function publicAsset(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = import.meta.env.BASE_URL ?? "/";
  if (base === "/" || base === "") return normalized;
  const b = base.replace(/\/$/, "");
  return `${b}${normalized}`;
}

/**
 * Sidebar logo — uses an ASCII filename so every browser/dev server resolves it reliably.
 * Keep your artwork in `public/leadingmile-logo.png` (same pixels as
 * `LEADINGMILE LOGO CMYK_WHITE_GREEN 2.png`; copy that file over this one when you update).
 */
export const LEADINGMILE_LOGO_PNG = publicAsset("leadingmile-logo.png");

/** If `leadingmile-logo.png` is missing, load the CMYK asset (spaces URL-encoded). */
const CMYK_LOGO_FILE = "LEADINGMILE LOGO CMYK_WHITE_GREEN 2.png";
export const LEADINGMILE_LOGO_FALLBACK = publicAsset(
  encodeURIComponent(CMYK_LOGO_FILE)
);

/** Tab icon + optional hero mark — file lives in `public/Favicon.png`. */
export const FAVICON_PNG = publicAsset("Favicon.png");
