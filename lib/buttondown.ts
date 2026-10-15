/**
 * Buttondown single source of truth.
 *
 * Buttondown is Parkio Daily's canonical newsletter delivery platform
 * (see docs/AUTOMATION.md — it polls /feed.xml on its own schedule and
 * emails subscribers; this module is unrelated to that side and only
 * covers how a visitor gets ONTO the subscriber list in the first
 * place).
 *
 * Unlike APP_STORE_URL in lib/appStore.ts, there is deliberately NO
 * hard-coded fallback identifier here — the real Buttondown username
 * was not found anywhere in this repository (checked: all docs, all
 * code, git history including a commit titled "Buttondown", the n8n
 * workflow JSON) and must not be guessed. Until
 * NEXT_PUBLIC_BUTTONDOWN_USERNAME (or the hosted-page fallback) is set,
 * BUTTONDOWN_READY is false and the newsletter page shows a
 * configuration-pending state instead of a form that silently can't
 * submit anywhere real.
 *
 * Resolution order, same ladder app/newsletter/page.tsx used for
 * Beehiiv:
 *   1. NEXT_PUBLIC_BUTTONDOWN_USERNAME set → render the native
 *      embeddable form (visitor stays on parkio.info; the browser tab
 *      that receives Buttondown's own confirmation response opens
 *      separately via target="_blank" rather than navigating away).
 *   2. NEXT_PUBLIC_BUTTONDOWN_SUBSCRIBE_URL set (and no username) →
 *      link out to Buttondown's hosted subscribe page.
 *   3. Neither set → configuration-pending placeholder, no form.
 *
 * IMPORTANT before enabling in production: the embed <form> below
 * targets Buttondown's standard public, unauthenticated
 * embed-subscribe endpoint (https://buttondown.email/api/emails/embed-subscribe/{username}),
 * which is the widely-documented pattern and requires no API key. But
 * verify the exact markup (field names, any honeypot/anti-spam hidden
 * field Buttondown's dashboard asks you to include) against the real
 * embed snippet from Buttondown → Settings → Grow → Embeddable form for
 * this specific publication before treating it as production-ready —
 * that snippet is the authoritative source, not this file.
 */
export const BUTTONDOWN_USERNAME: string =
  process.env.NEXT_PUBLIC_BUTTONDOWN_USERNAME ?? "";

export const BUTTONDOWN_SUBSCRIBE_URL: string =
  process.env.NEXT_PUBLIC_BUTTONDOWN_SUBSCRIBE_URL ?? "";

/** True once a username is configured — the embed form can render. */
export const BUTTONDOWN_EMBED_READY: boolean = BUTTONDOWN_USERNAME.length > 0;

/**
 * True once either the embed form or the hosted-page fallback can
 * render. False means: show the configuration-pending placeholder.
 */
export const BUTTONDOWN_READY: boolean =
  BUTTONDOWN_EMBED_READY || BUTTONDOWN_SUBSCRIBE_URL.length > 0;

/**
 * Buttondown's public embed-subscribe endpoint for this publication.
 * Only meaningful when BUTTONDOWN_EMBED_READY is true.
 */
export function buttondownEmbedAction(): string {
  return `https://buttondown.email/api/emails/embed-subscribe/${BUTTONDOWN_USERNAME}`;
}

/**
 * Tracking attribute on the subscribe form's submit button, matching
 * the APP_DOWNLOAD_CTA_ATTR pattern in lib/appStore.ts — inert today
 * (no analytics installed yet in this repo), a hook for when it is.
 */
export const NEWSLETTER_SUBSCRIBE_CTA_ATTR = "newsletter-subscribe" as const;
