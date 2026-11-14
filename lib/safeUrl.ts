/**
 * Guards for URLs that arrive in Daily briefing JSON.
 *
 * Those files are produced from third-party RSS feeds and YouTube
 * metadata, so a `javascript:`, `data:`, or `vbscript:` value must never
 * reach an `href`, and a thumbnail must never be able to close a CSS
 * `url()` early.
 */

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Characters that end an unquoted CSS `url()` token, start a string, or
 * escape the next character. Encoded as a CSS hex escape with a trailing
 * space so the following character is not swallowed as more hex digits.
 */
const CSS_URL_SPECIAL = /["'()\\\s\u0000-\u001F\u007F]/g;

/**
 * Absolute http(s) URL, or null.
 *
 * The URL parser strips tabs and newlines before it reads the scheme, so
 * `java\nscript:` and mixed-case `JaVaScRiPt:` are rejected rather than
 * cleaned into something we would then trust. Returns the original string
 * when the parser would only add a trailing slash on a bare origin, so
 * published links such as `https://www.disneyfoodblog.com` stay unchanged.
 * Any other rewrite (encoded spaces, folded backslashes, a lowercased
 * host) is replaced with the canonical http(s) URL.
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (!HTTP_PROTOCOLS.has(parsed.protocol)) return null;
  if (parsed.hostname === "") return null;

  if (parsed.href === trimmed || parsed.href === `${trimmed}/`) return trimmed;
  return parsed.href;
}

/**
 * http(s) URL safe to interpolate into an unquoted CSS `url(...)`.
 * Quotes, parentheses, backslashes, whitespace, and control characters
 * are CSS-hex-escaped so they cannot break out of the function. Returns
 * null for anything that is not an http(s) URL, and returns the URL
 * unchanged when it contains none of those characters.
 */
export function safeCssUrl(value: string | null | undefined): string | null {
  const url = safeHttpUrl(value);
  if (url === null) return null;
  return url.replace(CSS_URL_SPECIAL, (ch) => {
    return `\\${ch.charCodeAt(0).toString(16)} `;
  });
}
