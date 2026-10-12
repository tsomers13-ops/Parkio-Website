/**
 * Alert delivery is behind a narrow interface on purpose: the decision
 * logic (missedPublicationCheck.ts) and the dispatch-failure path never
 * need to know HOW an alert is delivered, only THAT it was.
 */

export interface AlertSender {
  send(subject: string, body: string): Promise<void>;
}

/**
 * Cloudflare-native outbound email via a `send_email` Worker binding
 * (Cloudflare Email Routing's "send from Workers" feature) — avoids
 * introducing a third-party transactional-email API key as a brand new
 * credential.
 *
 * Uses the structured `EmailMessageBuilder` form of `SendEmail.send()`
 * (confirmed against this package's own installed
 * @cloudflare/workers-types definitions: `send(builder: EmailMessageBuilder)`,
 * where the builder is a plain `{ from, to, subject, text }` object) rather
 * than the legacy `EmailMessage` class, which requires constructing a raw
 * RFC 5322 MIME string and wrapping it via
 * `new EmailMessage(from, to, raw)` imported from `cloudflare:email`.
 *
 * An earlier version of this file called `sendEmailBinding.send(rawMimeString)`
 * directly with neither wrapper — found and fixed during activation
 * preparation, before any deploy: neither of `SendEmail.send()`'s two real
 * overloads accepts a bare string, so that call would have failed at
 * runtime. The structured form avoids the mistake category entirely (no
 * MIME construction at all), which is also why it's what Cloudflare's own
 * docs recommend for new code.
 *
 * Requires, at deploy time (none of this is provisioned by this PR):
 *   - A verified sending address on the account's Email Routing setup
 *     (an unverified `from` domain fails with `E_SENDER_NOT_VERIFIED`)
 *   - A `send_email` binding in wrangler.jsonc naming this Worker's
 *     allowed destination address(es)
 */
export class CloudflareEmailAlertSender implements AlertSender {
  constructor(
    private readonly sendEmailBinding: { send(builder: EmailMessageBuilderLike): Promise<unknown> },
    private readonly fromAddress: string,
    private readonly toAddress: string
  ) {}

  async send(subject: string, body: string): Promise<void> {
    await this.sendEmailBinding.send({
      from: this.fromAddress,
      to: this.toAddress,
      subject,
      text: body,
    });
  }
}

/**
 * Mirrors the real `EmailMessageBuilder` shape from
 * @cloudflare/workers-types, kept local (rather than importing that
 * package's types directly here) so this file's dependency on the
 * Workers-specific type package stays confined to this one narrow spot.
 */
export interface EmailMessageBuilderLike {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
}
