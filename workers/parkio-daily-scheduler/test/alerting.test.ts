import { describe, expect, it, vi } from "vitest";
import { CloudflareEmailAlertSender, type AlertSender } from "../src/alerting";

describe("AlertSender interface — callers only need send(subject, body)", () => {
  it("a fake sender satisfies the interface and records what it was called with", async () => {
    const calls: Array<{ subject: string; body: string }> = [];
    const fake: AlertSender = {
      async send(subject, body) {
        calls.push({ subject, body });
      },
    };

    await fake.send("Test subject", "Test body");
    expect(calls).toEqual([{ subject: "Test subject", body: "Test body" }]);
  });
});

describe("CloudflareEmailAlertSender", () => {
  // Confirmed against this package's own installed
  // @cloudflare/workers-types: SendEmail.send() takes either a legacy
  // EmailMessage (constructed from a raw MIME string via
  // `cloudflare:email`) or the structured EmailMessageBuilder form — a
  // plain { from, to, subject, text } object, no MIME construction
  // needed. An earlier version of this file passed a raw MIME string
  // directly, which matches NEITHER real overload and would have failed
  // at runtime; these tests pin down the actual, confirmed shape instead.
  it("calls the binding with a plain structured object — from, to, subject, text — not a raw MIME string", async () => {
    const sendSpy = vi.fn().mockResolvedValue(undefined);
    const fakeBinding = { send: sendSpy };

    const sender = new CloudflareEmailAlertSender(fakeBinding, "alerts@parkio.info", "tsomers13@gmail.com");
    await sender.send("Missed publication", "The 7:15 AM check found nothing live.");

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const builder = sendSpy.mock.calls[0][0];
    expect(builder).toEqual({
      from: "alerts@parkio.info",
      to: "tsomers13@gmail.com",
      subject: "Missed publication",
      text: "The 7:15 AM check found nothing live.",
    });
  });

  it("does not pass anything resembling a MIME header block (no 'Content-Type:', no 'MIME-Version:') — confirms no manual MIME construction happens anywhere in this path", async () => {
    const sendSpy = vi.fn().mockResolvedValue(undefined);
    const sender = new CloudflareEmailAlertSender({ send: sendSpy }, "alerts@parkio.info", "tsomers13@gmail.com");
    await sender.send("Subject line", "Body text");

    const serialized = JSON.stringify(sendSpy.mock.calls[0][0]);
    expect(serialized).not.toContain("MIME-Version");
    expect(serialized).not.toContain("Content-Type");
  });
});
