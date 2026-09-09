/**
 * Write-origin protection.
 *
 * The rating POST is a cookie-authenticated state mutation, so it needs
 * cross-site protection. SameSite=Lax already stops the cookie riding along on
 * a cross-site POST; this is the second, explicit lock: the request must
 * declare an Origin, and that Origin must be ours.
 *
 * Deliberately does not trust the Host header, which a proxy can set.
 */

const PRODUCTION_ORIGINS = ["https://parkio.info", "https://www.parkio.info"];

/** Cloudflare Pages preview deployments, e.g. https://abc123.parkio.pages.dev */
const PREVIEW_HOST_SUFFIX = ".parkio.pages.dev";

function isLocalhost(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

/** True when the Origin belongs to Parkio in some environment. */
export function isAllowedWriteOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (PRODUCTION_ORIGINS.includes(url.origin)) return true;
  if (url.protocol === "https:" && url.hostname.endsWith(PREVIEW_HOST_SUFFIX)) return true;
  if (isLocalhost(url)) return true;
  return false;
}

/** A rating POST must be JSON — never a form post, which is trivially cross-site. */
export function isJsonContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  return contentType.split(";")[0].trim().toLowerCase() === "application/json";
}

/** Four integers do not need a large body. */
export const MAX_RATING_BODY_BYTES = 1024;
