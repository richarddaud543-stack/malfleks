import { afterEach, describe, expect, it, vi } from "vitest";

import { SOKO_CONTACT_EMAIL } from "@/lib/contact";
import {
  isEmailConfigured,
  notifyAddress,
  notifySender,
  orderRequestMessage,
  partnerApplicationMessage,
  sendNotification,
} from "./email";

/**
 * The contract these tests hold is mostly about what must *not* happen.
 *
 * A notification is the least important thing in any request that sends one.
 * The order is written, the application is saved — the email is a courtesy to
 * whoever runs Soko. So the tests that matter are the ones proving this module
 * cannot take a request down with it, and that it does not quietly post a
 * customer's phone number to a third party.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("configuration", () => {
  it("is not configured without a key", () => {
    expect(isEmailConfigured({})).toBe(false);
  });

  // The empty-string trap: `??` does not catch "", and an env var set to an
  // empty string in a dashboard looks exactly like one that is set.
  it("treats an empty or blank key as not configured", () => {
    expect(isEmailConfigured({ RESEND_API_KEY: "" })).toBe(
      false,
    );
    expect(
      isEmailConfigured({ RESEND_API_KEY: "   " }),
    ).toBe(false);
  });

  it("is configured with a real key", () => {
    expect(
      isEmailConfigured({ RESEND_API_KEY: "re_123" }),
    ).toBe(true);
  });

  it("falls back to the published contact address, never to nothing", () => {
    expect(notifyAddress({})).toBe(SOKO_CONTACT_EMAIL);
    expect(
      notifyAddress({ SOKO_NOTIFY_EMAIL: "  " }),
    ).toBe(SOKO_CONTACT_EMAIL);
    expect(
      notifyAddress({ SOKO_NOTIFY_EMAIL: "ops@example.com" }),
    ).toBe("ops@example.com");
  });

  it("has a sender that works before any domain is verified", () => {
    expect(notifySender({})).toContain("resend.dev");
  });
});

describe("sendNotification", () => {
  it("sends nothing at all when there is no key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await sendNotification("s", "b", {});

    expect(result).toEqual({ sent: false, reason: "not-configured" });
    // The point: an unconfigured deployment must not be making outbound calls.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts the message to Resend when configured", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    const result = await sendNotification("Subject here", "Body here", {
      RESEND_API_KEY: "re_123",
      SOKO_NOTIFY_EMAIL: "ops@example.com",
    });

    expect(result).toEqual({ sent: true });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual(["ops@example.com"]);
    expect(body.subject).toBe("Subject here");
    expect(body.text).toBe("Body here");
  });

  it("reports a rejected key without throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 401 }),
    );

    await expect(
      sendNotification("s", "b", { RESEND_API_KEY: "re_bad" }),
    ).resolves.toEqual({ sent: false, reason: "rejected" });
  });

  // The case the module exists to survive.
  it("swallows a network failure rather than throwing into the caller", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      sendNotification("s", "b", { RESEND_API_KEY: "re_123" }),
    ).resolves.toEqual({ sent: false, reason: "failed" });
  });
});

describe("what the messages say", () => {
  it("names the business and points at the review queue", () => {
    const { subject, body } = partnerApplicationMessage({
      kind: "brand",
      businessName: "Kariakoo Electronics",
      city: "Dar es Salaam",
      siteUrl: "https://soko.example",
    });

    expect(subject).toContain("Kariakoo Electronics");
    expect(body).toContain("Dar es Salaam");
    expect(body).toContain("https://soko.example/admin");
    // Approval is not publication, and the email should not imply it is.
    expect(body).toMatch(/approv/i);
  });

  it("distinguishes a courier from a branch", () => {
    expect(
      partnerApplicationMessage({
        kind: "courier",
        businessName: "Pikipiki Express",
        city: "Arusha",
        siteUrl: "https://soko.example",
      }).subject,
    ).toContain("courier");
  });

  it("carries the order reference and a link, and no personal details", () => {
    const { subject, body } = orderRequestMessage({
      reference: "SOKO-4F2A",
      siteUrl: "https://soko.example",
    });

    expect(subject).toContain("SOKO-4F2A");
    expect(body).toContain("https://soko.example/admin/orders");
    expect(body).toMatch(/rather\s+than\s+in\s+this\s+email/);
  });

  it("uses the product name when the caller has one", () => {
    expect(
      orderRequestMessage({
        reference: "SOKO-4F2A",
        productName: "Corolla Hybrid",
        siteUrl: "https://soko.example",
      }).body,
    ).toContain("Corolla Hybrid");
  });
});
