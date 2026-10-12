/**
 * Alert delivery is behind a narrow interface on purpose: the decision
 * logic (missedPublicationCheck.ts) and the dispatch-failure path never
 * need to know HOW an alert is delivered, only THAT it was. This keeps
 * the well-tested decision logic independent of the one piece that can't
 * be fully verified until a real deploy — see the PR description for why
 * the concrete sender below is flagged as needing a deploy-time decision.
 */

export interface AlertSender {
  send(subject: string, body: string): Promise<void>;
}

/**
 * Cloudflare-native outbound email via a `send_email` Worker binding
 * (Cloudflare Email Routing's "send from Workers" feature) — avoids
 * introducing a third-party transactional-email API key as a brand new
 * credential. Requires, at deploy time (none of this is provisioned by
 * this PR):
 *   - A verified sending address on the account's Email Routing setup
 *   - A `send_email` binding in wrangler.jsonc naming the allowed
 *     destination address(es)
 * NOT independently verified end-to-end in this PR, since doing so needs
 * a real deploy — flagged explicitly in the PR description and the
 * deployment checklist as the one piece to confirm first, with a plain
 * webhook-based fallback noted as an alternative if this doesn't fit.
 */
export class CloudflareEmailAlertSender implements AlertSender {
  constructor(
    private readonly sendEmailBinding: { send(message: unknown): Promise<void> },
    private readonly fromAddress: string,
    private readonly toAddress: string
  ) {}

  async send(subject: string, body: string): Promise<void> {
    // Constructed at call time (not imported at module scope) so this
    // file has no hard dependency on the `mimetext` package for callers
    // that only want the pure decision logic and a fake sender in tests.
    const { createMimeMessage } = await import("mimetext");
    const msg = createMimeMessage();
    msg.setSender(this.fromAddress);
    msg.setRecipient(this.toAddress);
    msg.setSubject(subject);
    msg.addMessage({ contentType: "text/plain", data: body });
    await this.sendEmailBinding.send(msg.asRaw());
  }
}
