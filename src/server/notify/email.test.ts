import { afterEach, describe, expect, it, vi } from "vitest";

import { MALFLEKS_CONTACT_EMAIL } from "@/lib/contact";
import {
  applicationApprovedMessage,
  applicationRejectedMessage,
  branchNewOrderMessage,
  branchOrderReminderMessage,
  isEmailConfigured,
  notifyAddress,
  notifyProvider,
  notifySender,
  orderRequestMessage,
  parseSender,
  paymentReadyMessage,
  paymentReceivedMessage,
  sendCustomerEmail,
  partnerApplicationMessage,
  sendNotification,
  orderCancelledMessage,
  orderDeliveredMessage,
  orderPaidPartnerMessage,
  partnerActivatedMessage,
  partnerStatusMessage,
  payoutSentMessage,
  productPublishedMessage,
  productSentBackMessage,
  refundRecordedMessage,
  sendPartnerEmail,
  stuckOrdersDigestMessage,
  autoPayoutAttentionAdminMessage,
  deliveryProblemAdminMessage,
} from "./email";

/**
 * The contract these tests hold is mostly about what must *not* happen.
 *
 * A notification is the least important thing in any request that sends one.
 * The order is written, the application is saved — the email is a courtesy to
 * whoever runs MalFleks. So the tests that matter are the ones proving this module
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
    expect(notifyAddress({})).toBe(MALFLEKS_CONTACT_EMAIL);
    expect(
      notifyAddress({ MALFLEKS_NOTIFY_EMAIL: "  " }),
    ).toBe(MALFLEKS_CONTACT_EMAIL);
    expect(
      notifyAddress({ MALFLEKS_NOTIFY_EMAIL: "ops@example.com" }),
    ).toBe("ops@example.com");
  });

  it("has a sender that works before any domain is verified", () => {
    expect(notifySender({})).toContain("resend.dev");
  });

  it("prefers NOTIFY_FROM, and still honours the older RESEND_FROM", () => {
    expect(notifySender({ NOTIFY_FROM: "MalFleks <hello@malfleks.co.tz>" })).toBe(
      "MalFleks <hello@malfleks.co.tz>",
    );
    expect(notifySender({ RESEND_FROM: "MalFleks <old@malfleks.co.tz>" })).toBe(
      "MalFleks <old@malfleks.co.tz>",
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
 * github.com and MalFleks's own deployment all did. A marketplace run from a
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
    expect(parseSender("MalFleks <hello@malfleks.co.tz>")).toEqual({
      name: "MalFleks",
      email: "hello@malfleks.co.tz",
    });
  });

  it("handles a bare address", () => {
    expect(parseSender("hello@malfleks.co.tz")).toEqual({
      email: "hello@malfleks.co.tz",
    });
  });

  it("tolerates quotes and stray whitespace", () => {
    expect(parseSender('  "MalFleks Tanzania"  <  hello@malfleks.co.tz  >  ')).toEqual({
      name: "MalFleks Tanzania",
      email: "hello@malfleks.co.tz",
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
      MALFLEKS_NOTIFY_EMAIL: "ops@example.com",
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
      NOTIFY_FROM: "MalFleks <hello@malfleks.co.tz>",
      MALFLEKS_NOTIFY_EMAIL: "ops@example.com",
    });

    expect(result).toEqual({ sent: true });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    // Brevo authenticates with its own header, not a bearer token.
    expect((init.headers as Record<string, string>)["api-key"]).toBe("xkeysib_1");
    const body = JSON.parse(String(init.body));
    expect(body.sender).toEqual({ name: "MalFleks", email: "hello@malfleks.co.tz" });
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
      adminUrl: "https://admin.malfleks.example",
    });

    expect(subject).toContain("Kariakoo Electronics");
    expect(body).toContain("Dar es Salaam");
    // The admin host, never the shop's: /admin is a 404 on the public host.
    expect(body).toContain("https://admin.malfleks.example/admin/applications");
    // Approval is not publication, and the email should not imply it is.
    expect(body).toMatch(/approv/i);
  });

  it("distinguishes a courier from a branch", () => {
    expect(
      partnerApplicationMessage({
        kind: "courier",
        businessName: "Pikipiki Express",
        city: "Arusha",
        adminUrl: "https://admin.malfleks.example",
      }).subject,
    ).toContain("courier");
  });

  it("carries the order reference and a link, and no personal details", () => {
    const { subject, body } = orderRequestMessage({
      reference: "MALFLEKS-4F2A",
      adminUrl: "https://admin.malfleks.example",
    });

    expect(subject).toContain("MALFLEKS-4F2A");
    expect(body).toContain("https://admin.malfleks.example/admin/orders");
    expect(body).toMatch(/rather\s+than\s+in\s+this\s+email/);
  });

  it("uses the product name when the caller has one", () => {
    expect(
      orderRequestMessage({
        reference: "MALFLEKS-4F2A",
        productName: "Corolla Hybrid",
        adminUrl: "https://admin.malfleks.example",
      }).body,
    ).toContain("Corolla Hybrid");
  });
});

describe("customer emails", () => {
  it("never mails something that is not an address", async () => {
    const env = { BREVO_API_KEY: "k", NOTIFY_FROM: "MalFleks <hello@example.test>" };
    for (const bad of [null, undefined, "", "not-an-address", "a@b", "two@example.test, three@example.test", "x@example.test\nBcc: y@example.test"]) {
      await expect(sendCustomerEmail(bad, "s", "b", env)).resolves.toEqual({ sent: false, reason: "no-address" });
    }
  });

  it("says not-configured rather than pretending when there is no provider", async () => {
    await expect(sendCustomerEmail("asha@example.test", "s", "b", {})).resolves.toEqual({ sent: false, reason: "not-configured" });
  });

  it("the checkout email links to the MalFleks pay page and states the total", () => {
    const { subject, body } = paymentReadyMessage({
      firstName: "Asha",
      reference: "ORA-DOD-N6CD",
      productName: "head sets",
      quantity: 2,
      branchName: "oraimo — Dodoma",
      totalTZS: 5574,
      siteUrl: "https://malfleks.vercel.app",
    });
    expect(subject).toContain("ORA-DOD-N6CD");
    expect(body).toContain("https://malfleks.vercel.app/pay/ORA-DOD-N6CD");
    expect(body).toContain("TSh 5,574");
    expect(body).toContain("2 × head sets");
  });

  it("the receipt carries both references and the amount", () => {
    const { subject, body } = paymentReceivedMessage({
      firstName: null,
      reference: "ORA-DOD-N6CD",
      productName: "head sets",
      amountTZS: 5574,
      paymentReference: "6274489582750774",
      siteUrl: "https://malfleks.vercel.app",
    });
    expect(subject).toContain("Payment received");
    expect(body).toContain("TSh 5,574");
    expect(body).toContain("6274489582750774");
    expect(body).toContain("https://malfleks.vercel.app/track/ORA-DOD-N6CD");
  });

  it("the receipt gives the delivery code in both languages, and says when to hand it over", () => {
    const { body } = paymentReceivedMessage({
      firstName: "Asha",
      reference: "ORA-DOD-N6CD",
      productName: "head sets",
      amountTZS: 5574,
      paymentReference: "6274489582750774",
      deliveryCode: "048291",
      siteUrl: "https://malfleks.vercel.app",
    });
    expect(body).toContain("YOUR DELIVERY CODE: 048291");
    expect(body).toContain("NAMBA YAKO YA KUPOKEA MZIGO: 048291");
    expect(body).toMatch(/only once the goods are in your hands/);
    expect(body).toMatch(/MalFleks will never ask you for it/);
  });

  it("the receipt says nothing about a code when there is none to give", () => {
    const { body } = paymentReceivedMessage({
      firstName: null,
      reference: "ORA-DOD-N6CD",
      productName: "head sets",
      amountTZS: 5574,
      paymentReference: "6274489582750774",
      deliveryCode: null,
      siteUrl: "https://malfleks.vercel.app",
    });
    expect(body).not.toMatch(/DELIVERY CODE|KUPOKEA MZIGO/);
  });

  it("tells whoever delivers to ask for the customer's code, and no longer to mark it delivered themselves", () => {
    for (const role of ["deliver", "collect"] as const) {
      const { body } = orderPaidPartnerMessage({ role, reference: "ORA-DOD-N6CD", productName: "head sets", quantity: 2, branchName: "oraimo Dodoma", carrier: "MR RICKYY", siteUrl: "https://malfleks.vercel.app" });
      expect(body).toMatch(/delivery code/);
      expect(body).toMatch(/tarakimu\s+6|tarakimu 6/);
      expect(body).not.toMatch(/once you mark/);
    }
  });

  it("tells MalFleks when a delivery could not be confirmed, with the partner's words and where to settle it", () => {
    const reported = deliveryProblemAdminMessage({ reference: "ORA-DOD-N6CD", productName: "head sets", why: "reported", note: "Phone off, code forgotten", adminUrl: "https://admin.example" });
    expect(reported.subject).toContain("ORA-DOD-N6CD");
    expect(reported.body).toContain("Phone off, code forgotten");
    expect(reported.body).toContain("https://admin.example/admin/orders");
    const locked = deliveryProblemAdminMessage({ reference: "ORA-DOD-N6CD", productName: "head sets", why: "locked", note: null, adminUrl: null });
    expect(locked.body).toMatch(/wrong delivery code/);
  });

  it("tells MalFleks when an automatic payout came back", () => {
    const { subject, body } = autoPayoutAttentionAdminMessage({ payee: "oraimo — Dodoma", amountTZS: 4574, note: "ClickPesa reported REVERSED", adminUrl: "https://admin.example" });
    expect(subject).toContain("TSh 4,574");
    expect(subject).toContain("oraimo — Dodoma");
    expect(body).toContain("ClickPesa reported REVERSED");
    expect(body).toContain("https://admin.example/admin/payouts");
  });
});

/**
 * The messages added on 3 Oct 2026, when partners and customers started being
 * told about the steps that concern them. Each test holds the two things the
 * brief asked of every one: it names the order or product, and it gives one
 * place to go -- on the shop's own host, never the admin's.
 */
const SITE = "https://malfleks.example";

describe("partner emails", () => {
  it("never mails something that is not an address, and says so when unconfigured", async () => {
    const env = { BREVO_API_KEY: "k", NOTIFY_FROM: "MalFleks <hello@example.test>" };
    for (const bad of [null, undefined, "", "not-an-address", "x@example.test\nBcc: y@example.test"]) {
      await expect(sendPartnerEmail(bad, "s", "b", env)).resolves.toEqual({ sent: false, reason: "no-address" });
    }
    await expect(sendPartnerEmail("shop@example.test", "s", "b", {})).resolves.toEqual({ sent: false, reason: "not-configured" });
  });

  it("approval says it is an account, not a listing, and links to the partner page", () => {
    const { subject, body } = applicationApprovedMessage({ contactName: "Asha Mwenda", businessName: "Kariakoo Electronics", kind: "brand", siteUrl: SITE });
    expect(subject).toContain("Kariakoo Electronics");
    expect(body).toContain("Hello Asha,");
    expect(body).toContain(`${SITE}/partner`);
    expect(body).toMatch(/put your branch on the map/);
    // A courier is told about routing, not a map.
    expect(applicationApprovedMessage({ contactName: null, businessName: "Pikipiki", kind: "courier", siteUrl: SITE }).body).toMatch(/delivery routing/);
  });

  it("rejection carries the reason and where to apply again", () => {
    const { body } = applicationRejectedMessage({ contactName: "Asha", businessName: "Kariakoo Electronics", reason: "We could not confirm the address", siteUrl: SITE });
    expect(body).toContain("The reason: We could not confirm the address");
    expect(body).toContain(`${SITE}/apply`);
  });

  it("activation tells a branch to list a product and a courier where jobs appear", () => {
    expect(partnerActivatedMessage({ contactName: null, businessName: "Kariakoo", kind: "brand", siteUrl: SITE }).body).toContain(`${SITE}/partner/products/new`);
    expect(partnerActivatedMessage({ contactName: null, businessName: "Pikipiki", kind: "courier", siteUrl: SITE }).body).toContain(`${SITE}/partner/orders`);
  });

  it("a new order names the reference and product, and nothing about the customer", () => {
    const { subject, body } = branchNewOrderMessage({ reference: "TOY-DAR-K7M4", productName: "Toyota Corolla", quantity: 2, siteUrl: SITE });
    expect(subject).toContain("TOY-DAR-K7M4");
    expect(body).toContain("2 × Toyota Corolla");
    expect(body).toContain(`${SITE}/partner/orders`);
    expect(body).toMatch(/Nothing has been paid yet/);
  });

  it("the reminder says it is the only one", () => {
    const { subject, body } = branchOrderReminderMessage({ reference: "TOY-DAR-K7M4", productName: "Toyota Corolla", siteUrl: SITE });
    expect(subject).toContain("TOY-DAR-K7M4");
    expect(body).toContain(`${SITE}/partner/orders`);
    expect(body).toMatch(/only reminder/);
  });

  it("a paid order tells each party its own next step", () => {
    const base = { reference: "TOY-ARU-9XQ2", productName: "Toyota Hilux", quantity: 1, branchName: "Toyota — Arusha", carrier: "Arusha Swift Couriers", siteUrl: SITE };
    const deliver = orderPaidPartnerMessage({ ...base, role: "deliver" });
    expect(deliver.subject).toMatch(/deliver now/);
    expect(deliver.body).toMatch(/Collect nothing at the door/);

    const collect = orderPaidPartnerMessage({ ...base, role: "collect" });
    expect(collect.subject).toMatch(/deliver now/);
    expect(collect.body).toContain("collect it from Toyota — Arusha");

    const handOver = orderPaidPartnerMessage({ ...base, role: "hand-over" });
    expect(handOver.subject).toMatch(/hand it to the courier/);
    expect(handOver.body).toContain("Arusha Swift Couriers");

    for (const m of [deliver, collect, handOver]) {
      expect(m.subject).toContain("TOY-ARU-9XQ2");
      expect(m.body).toContain(`${SITE}/partner/orders`);
    }
  });

  it("published links to the live product; sent back carries the reason", () => {
    expect(productPublishedMessage({ productName: "Tecno Spark 20", productId: "tecno-spark-20", siteUrl: SITE }).body).toContain(`${SITE}/products/tecno-spark-20`);
    expect(productPublishedMessage({ productName: "Tecno Spark 20", productId: null, siteUrl: SITE }).body).toContain(`${SITE}/partner`);
    const back = productSentBackMessage({ productName: "Tecno Spark 20", reason: "The photo is of a different phone", siteUrl: SITE });
    expect(back.body).toContain("The reason: The photo is of a different phone");
    expect(back.body).toContain(`${SITE}/partner/products/new`);
  });

  it("a payout states the amount and the reference", () => {
    const { subject, body } = payoutSentMessage({ amountTZS: 94_000, payoutReference: "CPPAYOUT123", orderCount: 2, siteUrl: SITE });
    expect(subject).toContain("TSh 94,000");
    expect(subject).toContain("CPPAYOUT123");
    expect(body).toContain("for 2 delivered orders");
    expect(body).toContain("Payout reference: CPPAYOUT123");
  });

  it("suspension carries the reason; reactivation does not need one", () => {
    const suspended = partnerStatusMessage({ status: "suspended", businessName: "Kariakoo", reason: "Three orders undelivered", siteUrl: SITE });
    expect(suspended.subject).toMatch(/suspended/);
    expect(suspended.body).toContain("The reason: Three orders undelivered");
    expect(suspended.body).toContain(`${SITE}/contact`);
    const active = partnerStatusMessage({ status: "active", businessName: "Kariakoo", reason: null, siteUrl: SITE });
    expect(active.subject).toMatch(/active again/);
    expect(active.body).toContain(`${SITE}/partner`);
  });
});

describe("customer emails about an order under way", () => {
  it("a cancellation says whether money is involved, and it is one or the other", () => {
    const base = { firstName: "Asha", reference: "TOY-DAR-K7M4", productName: "Toyota Corolla", reason: "Out of stock", siteUrl: SITE };
    const unpaid = orderCancelledMessage({ ...base, paid: false });
    expect(unpaid.subject).toContain("TOY-DAR-K7M4");
    expect(unpaid.body).toContain("The reason: Out of stock");
    expect(unpaid.body).toContain("You have not been charged.");
    expect(unpaid.body).not.toMatch(/refund/i);
    expect(unpaid.body).toContain(`${SITE}/account`);

    const paid = orderCancelledMessage({ ...base, paid: true });
    expect(paid.body).toContain("Your payment will be refunded");
    expect(paid.body).not.toContain("You have not been charged");
  });

  it("a cancellation with no reason does not print an empty one", () => {
    expect(orderCancelledMessage({ firstName: null, reference: "R", productName: "P", reason: null, paid: false, siteUrl: SITE }).body).not.toContain("The reason");
  });

  it("delivered thanks the customer and keeps the track link", () => {
    const { subject, body } = orderDeliveredMessage({ firstName: "Asha", reference: "TOY-DAR-K7M4", productName: "Toyota Corolla", siteUrl: SITE });
    expect(subject).toMatch(/delivered/);
    expect(body).toMatch(/Thank you/);
    expect(body).toContain(`${SITE}/track/TOY-DAR-K7M4`);
  });

  it("a refund states the amount and its reference", () => {
    const { subject, body } = refundRecordedMessage({ firstName: "Asha", reference: "TOY-DAR-K7M4", amountTZS: 68_000_000, refundReference: "RFND-778", siteUrl: SITE });
    expect(subject).toContain("TOY-DAR-K7M4");
    expect(body).toContain("TSh 68,000,000");
    expect(body).toContain("Refund reference: RFND-778");
  });
});

describe("the stuck-orders digest", () => {
  it("lists each group that has something in it, with the admin host's link", () => {
    const { subject, body } = stuckOrdersDigestMessage({
      undecided: [{ reference: "TOY-DAR-AAAA", productName: "Toyota Corolla", branchName: "Toyota — Dar", hours: 30 }],
      unpaid: [],
      undelivered: [
        { reference: "TOY-DAR-BBBB", productName: "Prado", branchName: "Toyota — Dar", hours: 80 },
        { reference: "TOY-DAR-CCCC", productName: "Hilux", branchName: "Toyota — Arusha", hours: 100 },
      ],
      adminUrl: "https://admin.malfleks.example",
    });
    expect(subject).toBe("MalFleks: 3 orders need a nudge");
    expect(body).toContain("Waiting more than a day for the branch to confirm (1)");
    expect(body).toContain("TOY-DAR-AAAA — Toyota Corolla, Toyota — Dar — 30h");
    expect(body).toContain("Paid more than three days ago and not marked delivered (2)");
    expect(body).toContain("TOY-DAR-CCCC — Hilux, Toyota — Arusha — 4 days");
    // An empty group is left out rather than printed with nothing under it.
    expect(body).not.toContain("not paid");
    expect(body).toContain("https://admin.malfleks.example/admin/orders");
    expect(body).toMatch(/Nothing has been cancelled/);
  });

  it("counts one order in the singular", () => {
    expect(
      stuckOrdersDigestMessage({ undecided: [], unpaid: [{ reference: "R", productName: "P", branchName: "B", hours: 50 }], undelivered: [], adminUrl: "https://a.example" }).subject,
    ).toBe("MalFleks: 1 order needs a nudge");
  });
});
