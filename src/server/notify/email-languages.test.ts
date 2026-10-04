import { describe, expect, it } from "vitest";

import {
  ENGLISH_BELOW,
  applicationApprovedMessage,
  branchNewOrderMessage,
  cancelRequestAdminMessage,
  orderCancelledMessage,
  orderDeliveredMessage,
  orderPaidPartnerMessage,
  paymentReceivedMessage,
  payoutSentMessage,
  refundRecordedMessage,
} from "./email";

/**
 * Every email to a customer, a shop or a courier carries both languages:
 * Swahili first, English below (the owner's decision, 4 Oct 2026). Emails to
 * MalFleks's own inbox stay in English.
 */
const SITE = "https://shop.test";

function halves(body: string): [string, string] {
  const [sw, en] = body.split(`\n${ENGLISH_BELOW}\n`);
  return [sw, en];
}

describe("an email to a customer", () => {
  const message = paymentReceivedMessage({
    firstName: "Asha",
    reference: "ORA-DOD-N6CD",
    productName: "Earbuds",
    amountTZS: 5574,
    paymentReference: "CP-123",
    siteUrl: SITE,
  });

  it("is in Swahili first and English below, in one message", () => {
    const [sw, en] = halves(message.body);
    expect(sw).toMatch(/^Habari Asha,/);
    expect(sw).toContain("Tumepokea TSh 5,574");
    expect(en.trimStart()).toMatch(/^Hello Asha,/);
    expect(en).toContain("We have received TSh 5,574");
  });

  it("names both in the subject, Swahili first", () => {
    expect(message.subject).toBe(
      "Malipo ya oda yako ya MalFleks ORA-DOD-N6CD yamepokelewa | Payment received for your MalFleks order ORA-DOD-N6CD",
    );
  });

  it("gives the same references and the same link in each language", () => {
    const [sw, en] = halves(message.body);
    for (const half of [sw, en]) {
      expect(half).toContain("ORA-DOD-N6CD");
      expect(half).toContain("CP-123");
      expect(half).toContain(`${SITE}/track/ORA-DOD-N6CD`);
    }
  });
});

describe("every customer and partner email", () => {
  const messages = {
    cancelled: orderCancelledMessage({ firstName: null, reference: "R-1", productName: "P", reason: "Out of stock", paid: true, siteUrl: SITE }),
    delivered: orderDeliveredMessage({ firstName: "Asha", reference: "R-1", productName: "P", siteUrl: SITE }),
    refund: refundRecordedMessage({ firstName: "Asha", reference: "R-1", amountTZS: 1000, refundReference: "RF-1", siteUrl: SITE }),
    approved: applicationApprovedMessage({ contactName: "Juma", businessName: "Duka", kind: "brand", siteUrl: SITE }),
    newOrder: branchNewOrderMessage({ reference: "R-1", productName: "P", quantity: 2, siteUrl: SITE }),
    paid: orderPaidPartnerMessage({ role: "deliver", reference: "R-1", productName: "P", quantity: 1, branchName: "B", carrier: "C", siteUrl: SITE }),
    payout: payoutSentMessage({ amountTZS: 4000, payoutReference: "PO-1", orderCount: 1, siteUrl: SITE }),
  };

  it.each(Object.entries(messages))("%s carries both languages", (_name, message) => {
    const [sw, en] = halves(message.body);
    expect(sw.trim()).not.toBe("");
    expect(en?.trim() ?? "").not.toBe("");
    expect(message.subject).toContain(" | ");
    // The same number of links, so neither language sends its reader nowhere.
    const links = (text: string) => text.match(/https:\/\/shop\.test\S*/g) ?? [];
    expect(links(sw)).toEqual(links(en));
  });

  it("tells a seller in both languages to collect nothing at the door", () => {
    const [sw, en] = halves(messages.paid.body);
    expect(sw).toContain("Usipokee chochote mlangoni");
    expect(en).toContain("Collect nothing at the door");
  });

  it("promises the refund the same way in both", () => {
    const [sw, en] = halves(messages.cancelled.body);
    expect(sw).toContain("Utarudishiwa malipo yako");
    expect(en).toContain("Your payment will be refunded");
    // The reason is the shop's own words; it is passed on as written.
    expect(sw).toContain("Sababu: Out of stock");
  });
});

describe("an email to MalFleks's own inbox", () => {
  it("stays in English", () => {
    const message = cancelRequestAdminMessage({
      reference: "R-1",
      productName: "P",
      quantity: 1,
      customerName: "Asha",
      customerPhone: "+255754123456",
      adminUrl: "https://admin.test",
      orderId: "o1",
    });
    expect(message.body).not.toContain(ENGLISH_BELOW);
    expect(message.subject).toBe("MalFleks: customer asks to cancel R-1");
  });
});
