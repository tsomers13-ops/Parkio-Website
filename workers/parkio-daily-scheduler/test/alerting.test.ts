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
  it("builds a real MIME message (via the actual mimetext library, not a mock) with the right from/to/subject/body, and hands it to the binding", async () => {
    const sendSpy = vi.fn().mockResolvedValue(undefined);
    const fakeBinding = { send: sendSpy };

    const sender = new CloudflareEmailAlertSender(fakeBinding, "alerts@parkio.info", "tsomers13@gmail.com");
    await sender.send("Missed publication", "The 9:00 AM check found nothing live.");

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const rawMessage = sendSpy.mock.calls[0][0] as string;
    expect(rawMessage).toContain("alerts@parkio.info");
    expect(rawMessage).toContain("tsomers13@gmail.com");
    // mimetext RFC 2047-encodes the Subject header (base64), so assert via
    // decoding rather than a plain substring match — caught by running the
    // real library instead of a hand-written mock, which would never have
    // surfaced this.
    const subjectMatch = rawMessage.match(/Subject: =\?utf-8\?B\?([A-Za-z0-9+/=]+)\?=/);
    expect(subjectMatch).not.toBeNull();
    const decodedSubject = Buffer.from(subjectMatch![1], "base64").toString("utf8");
    expect(decodedSubject).toBe("Missed publication");
    expect(rawMessage).toContain("The 9:00 AM check found nothing live.");
  });
});
