import { afterEach, describe, expect, it, vi } from "vitest";

import { SOKO_CONTACT_EMAIL } from "@/lib/contact";
import {
  isEmailConfigured,
  notifyAddress,
  notifyProvider,
  notifySender,
  orderRequestMessage,
  parseSender,
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

  it("prefers NOTIFY_FROM, and still honours the older RESEND_FROM", () => {
    expect(notifySender({ NOTIFY_FROM: "Soko <hello@soko.co.tz>" })).toBe(
      "Soko <hello@soko.co.tz>",
    );
    expect(notifySender({ RESEND_FROM: "Soko <old@soko.co.tz>" })).toBe(
      "Soko <old@soko.co.tz>",
    );
    // Both set means a migration in progress; the new name wins.
    expect(
      notifySender({ NOTIFY_FROM: "a@b.c", RESEND_FROM: "d@e.f" }),
    ).toBe("a@b.c");
  });
});

/**
 * Two providers exist because on 2026-09-01 the owner's network could not reach
 * resend.com at all — that one IP did not route, while api.resend.com,
 * github.com and Soko's own deployment all did. A marketplace run from a
 * country with partial routing should not have one third-party dashboard as a
 * hard dependency.
 */
describe("choosing a provider", () => {
  it("chooses nothing when neither key is set", () => {
    expect(notifyProvider({})).toBeNull();
    expect(notifyProvider({ RESEND_API_KEY: "", BREVO_API_KEY: "  " })).toBeNull();
  });

  it("chooses whichever one has a key", () => {
    expect(notifyProvider({ RESEND_API_KEY: "re_1" })).toBe("resend");
    expect(notifyProvider({ BREVO_API_KEY: "xkeysib_1" })).toBe("brevo");
  });

  it("prefers Resend when both are set, rather than sending twice", () => {
    expect(
      notifyProvider({ RESEND_API_KEY: "re_1", BREVO_API_KEY: "xkeysib_1" }),
    ).toBe("resend");
  });

  it("counts either key as configured", () => {
    expect(isEmailConfigured({ BREVO_API_KEY: "xkeysib_1" })).toBe(true);
  });
});

describe("parseSender", () => {
  // Resend takes "Name <addr>"; Brevo wants { name, email }. One env var, two
  // shapes, so the split has to be right.
  it("splits a name and an address", () => {
    expect(parseSender("Soko <hello@soko.co.tz>")).toEqual({
      name: "Soko",
      email: "hello@soko.co.tz",
    });
  });

  it("handles a bare address", () => {
    expect(parseSender("hello@soko.co.tz")).toEqual({
      email: "hello@soko.co.tz",
    });
  });

  it("tolerates quotes and stray whitespace", () => {
    expect(parseSender('  "Soko Tanzania"  <  hello@soko.co.tz  >  ')).toEqual({
      name: "Soko Tanzania",
      email: "hello@soko.co.tz",
    });
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

  it("posts the Brevo shape to Brevo when that is the configured provider", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 201 }));

    const result = await sendNotification("Subject here", "Body here", {
      BREVO_API_KEY: "xkeysib_1",
      NOTIFY_FROM: "Soko <hello@soko.co.tz>",
      SOKO_NOTIFY_EMAIL: "ops@example.com",
    });

    expect(result).toEqual({ sent: true });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    // Brevo authenticates with its own header, not a bearer token.
    expect((init.headers as Record<string, string>)["api-key"]).toBe("xkeysib_1");
    const body = JSON.parse(String(init.body));
    expect(body.sender).toEqual({ name: "Soko", email: "hello@soko.co.tz" });
    expect(body.to).toEqual([{ email: "ops@example.com" }]);
    expect(body.textContent).toBe("Body here");
  });

  it("treats Brevo's 201 as sent", async () => {
    // Resend answers 200 and Brevo answers 201. Checking `response.ok` rather
    // than a literal 200 is what makes one code path serve both.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 201 }),
    );

    await expect(
      sendNotification("s", "b", { BREVO_API_KEY: "xkeysib_1" }),
    ).resolves.toEqual({ sent: true });
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
