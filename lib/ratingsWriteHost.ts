/**
 * Host authorization for Community write APIs.
 *
 * Cloudflare Pages serves this Worker on more hostnames than the one guests
 * use. Besides parkio.info there is the project alias parkio.pages.dev and an
 * immutable <deployment>.parkio.pages.dev alias for every deployment ever
 * made — all public, and all bound to the same Production D1 database. Zone
 * rules on parkio.info cannot close those routes, because *.pages.dev is
 * Cloudflare's zone and not ours.
 *
 * So write authority is asserted here, inside the Worker, where every
 * hostname that reaches the code is subject to it. Production write authority
 * belongs to parkio.info and to nothing else.
 *
 * This is additive. It runs before, and never in place of, Origin validation,
 * bearer verification and payload validation.
 */

/**
 * Set per environment in the Pages dashboard, alongside the D1 binding and
 * the identity secret. Absent means Production, which is the narrowest
 * policy — a missing variable must never be the thing that widens authority.
 */
export const COMMUNITY_WRITE_ENV_VAR = "PARKIO_COMMUNITY_WRITE_ENV";

export type CommunityWriteEnvironment = "production" | "preview" | "development";

/**
 * Exact hostnames, never suffixes. A suffix test would accept
 * parkio.info.attacker.example, and a substring test would also accept
 * attacker-parkio.info.
 */
const PRODUCTION_WRITE_HOSTS: readonly string[] = ["parkio.info", "www.parkio.info"];

/** `URL.hostname` renders IPv6 bracketed, so ::1 arrives as "[::1]". */
const LOCAL_WRITE_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Preview deployment and branch aliases. The leading dot is required: it is
 * what makes evilparkio.pages.dev fail. Bare parkio.pages.dev does not match
 * this suffix, which is correct — that alias serves the Production
 * deployment, which reads the Production policy and rejects itself.
 */
const PAGES_ALIAS_SUFFIX = ".parkio.pages.dev";

/**
 * An unrecognized value is an unknown environment and gets no write
 * authority at all. An absent value is not unknown — it is an environment
 * that predates this variable, and it is treated as Production.
 */
export function readCommunityWriteEnvironment(
  raw: unknown = (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env?.[
    COMMUNITY_WRITE_ENV_VAR
  ],
): CommunityWriteEnvironment | "unknown" {
  if (raw === undefined || raw === null || raw === "") return "production";
  if (typeof raw !== "string") return "unknown";
  const value = raw.trim().toLowerCase();
  if (value === "") return "production";
  if (value === "production" || value === "preview" || value === "development") return value;
  return "unknown";
}

/**
 * `host` must be a normalized `URL.hostname`: already lowercased, already
 * stripped of any port and of userinfo.
 */
export function isAllowedCommunityWriteHost(
  host: string,
  environment: CommunityWriteEnvironment | "unknown",
): boolean {
  if (!host) return false;

  switch (environment) {
    case "production":
      return PRODUCTION_WRITE_HOSTS.includes(host);
    case "preview":
      // Any Preview alias, so no single deployment hostname is baked in.
      // Deliberately NOT the production hosts: Preview must not be able to
      // exercise Production write authority.
      return host.endsWith(PAGES_ALIAS_SUFFIX) || LOCAL_WRITE_HOSTS.includes(host);
    case "development":
      return LOCAL_WRITE_HOSTS.includes(host);
    case "unknown":
      return false;
  }
}

/**
 * The authoritative hostname is the one Cloudflare routed on, which is what
 * `request.url` carries. Forwarded headers — X-Forwarded-Host and friends —
 * are attacker-supplied and are deliberately not consulted.
 */
export function readRequestHost(req: Request): string | null {
  try {
    const host = new URL(req.url).hostname;
    return host ? host.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * True when this request may perform a Community write. A malformed URL, an
 * unknown environment and an unlisted hostname all fail closed.
 */
export function isAllowedCommunityWriteRequest(
  req: Request,
  environment: CommunityWriteEnvironment | "unknown" = readCommunityWriteEnvironment(),
): boolean {
  const host = readRequestHost(req);
  if (host === null) return false;
  return isAllowedCommunityWriteHost(host, environment);
}
