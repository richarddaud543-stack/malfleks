// @vitest-environment node
//
// The whole marketplace loop, once, in order, against a real Postgres.
//
// Every step here has unit and integration coverage of its own. This file
// exists because they all passed while the loop was broken in three places at
// the same time, and no test noticed:
//
//   1. Nothing ever created a `Branch` or a `DeliveryAgent`. Approval left
//      `Partner.branchId` and `Partner.agentId` null forever.
//   2. `publishSubmission` was written, guarded, tested — and called by
//      nothing. No screen could turn a submission into a product.
//   3. A branch could not see the orders sent to it. Only MalFleks admin could.
//
// Each part was individually correct and collectively useless: a real shop
// could apply, be approved, sign in, submit a product, and never sell
// anything. The test that catches that class of failure is this one — it walks
// the path a real business walks, from an empty catalogue to a customer's order
// arriving in front of the branch that has to fulfil it, and asserts at every
// step that the next one is actually reachable.
//
// Do not "simplify" this into per-step tests. Those already exist above it.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  accrueCourierBalance,
  FeeQuoteError,
  quoteOrder,
  type CityFeeTable,
} from "@/lib/fees";
import { getPrisma } from "@/server/db/client";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { createOrder } from "@/server/orders/create-order";
import { listOrders } from "@/server/orders/list-orders";
import {
  cancelOrder,
  confirmOrder,
  markOrderFulfilled,
  orderHistory,
} from "@/server/orders/status";
import { getAllBrands, getProductById } from "@/server/repositories";
import { createApplicationForUser } from "./applications";
import { approveApplication } from "./review";
import {
  activateBrandPartner,
  activateCourierPartner,
} from "./activation";
import { partnerForUser, listSubmissionsForPartner } from "./portal";
import { partnerStatusForUser } from "./status";
import { publishSubmission, submitProduct } from "./submissions";

let db: TestDatabase;

beforeAll(async () => {
  // No seed. The loop starts where MalFleks actually starts: nothing listed.
  db = await createTestDatabase("loop");
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

const ADMIN = "admin-uid-loop";

describe("the whole loop, from an empty catalogue to an order in a branch's hands", () => {
  it("runs end to end", async () => {
    const db = getPrisma();
    expect(await db.brand.count()).toBe(0);

    // ---------------------------------------------------------------------
    // 1. A shop applies.
    // ---------------------------------------------------------------------
    const shopUid = `uid-shop-${Date.now()}`;

    // What `/apply` will show them, asserted at every stage below. Before this
    // existed the page showed the same blank form at all four of them, and the
    // quota allows five pending applications — so the natural response to
    // silence, applying again, filled the review queue with duplicates.
    expect(await partnerStatusForUser(shopUid)).toEqual({ state: "none" });

    const application = await createApplicationForUser(
      shopUid,
      "shop@example.com",
      {
        kind: "brand",
        businessName: "Kariakoo Electronics",
        contactName: "Asha Mwenda",
        phone: "0754123456",
        city: "Dar es Salaam",
        brandId: "",
        brandOther: "Kariakoo Electronics",
        address: "Kariakoo, Dar es Salaam",
        deliveryMode: "customer_pays",
        notes: "We sell phones and laptops.",
      },
    );
    expect(application.submitted).toBe(true);

    const pending = await db.partnerApplication.findFirst({
      where: { uid: shopUid },
      select: { id: true },
    });
    expect(pending).not.toBeNull();

    // "We have it, sent on <date>. You do not need to send another one."
    expect(await partnerStatusForUser(shopUid)).toMatchObject({
      state: "pending",
    });

    // ---------------------------------------------------------------------
    // 2. An admin approves it. This creates an account and NOTHING public.
    // ---------------------------------------------------------------------
    expect(await approveApplication(pending!.id, ADMIN)).toEqual({ ok: true });

    const partner = await partnerForUser(shopUid);
    expect(partner).not.toBeNull();
    // The state that used to be permanent.
    expect(partner!.branchId).toBeNull();
    expect(await db.branch.count()).toBe(0);

    // Approved, but not on the map: the state most likely to look like a
    // broken site. They have an account, they can reach the partner area, and
    // they cannot publish a thing. `/apply` says exactly that rather than
    // handing them the form again.
    expect(await partnerStatusForUser(shopUid)).toEqual({
      state: "partner",
      kind: "brand",
      live: false,
    });

    // ---------------------------------------------------------------------
    // 3. They can already prepare a listing — but it cannot be published,
    //    because there is no branch for a product to belong to.
    // ---------------------------------------------------------------------
    const early = await submitProduct(partner!.partnerId, {
      name: "Tecno Spark 20",
      category: "Phones",
      priceTZS: 320_000,
      image: "smartphone",
      description: "A dual-SIM phone with a big battery, sold from the counter.",
    });
    expect(early.ok).toBe(true);
    if (!early.ok) return;

    const blocked = await publishSubmission(early.value.id, ADMIN);
    expect(blocked).toEqual({ ok: false, reason: "no-branch" });

    // ---------------------------------------------------------------------
    // 4. The admin confirms their details and puts them on the map.
    // ---------------------------------------------------------------------
    const activated = await activateBrandPartner(partner!.partnerId, {
      brandId: null,
      brandName: "Kariakoo Electronics",
      category: "electronics",
      branchName: "Kariakoo Electronics — Dar es Salaam",
      city: "Dar es Salaam",
      addressLine: null, // not confirmed, so not published
      phone: "+255754123456",
      hours: null,
      deliveryOffered: false, // routes to a courier
      verified: false,
    });
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;

    // The catalogue now has exactly one brand, and it is theirs.
    expect((await getAllBrands()).map((b) => b.name)).toEqual([
      "Kariakoo Electronics",
    ]);

    const wired = await partnerForUser(shopUid);
    expect(wired!.branchId).toBe(activated.value.branchId);

    // And now they are live, which is the only difference `/apply` reports
    // between "we approved you" and "you can sell".
    expect(await partnerStatusForUser(shopUid)).toEqual({
      state: "partner",
      kind: "brand",
      live: true,
    });

    // ---------------------------------------------------------------------
    // 5. Now the same submission publishes.
    // ---------------------------------------------------------------------
    const published = await publishSubmission(early.value.id, ADMIN);
    expect(published.ok).toBe(true);
    if (!published.ok) return;

    const live = await getProductById(published.value.productId);
    expect(live?.name).toBe("Tecno Spark 20");
    expect(live?.priceTZS).toBe(320_000);

    // And the partner sees the outcome on their own page, with the link.
    const theirs = await listSubmissionsForPartner(partner!.partnerId);
    expect(theirs[0].status).toBe("published");
    expect(theirs[0].publishedProductId).toBe(published.value.productId);

    // ---------------------------------------------------------------------
    // 6. The branch does not deliver, so a customer cannot order it yet —
    //    there is no courier covering the city. That is honest, and it is
    //    also the courier half of the loop being unfinished.
    // ---------------------------------------------------------------------
    const tooEarly = await createOrder(
      {
        productId: published.value.productId,
        quantity: "1",
        fullName: "Neema Joseph",
        phone: "0754000111",
        address: "Mikocheni B",
        agentId: null,
        reference: "",
        requestedAt: new Date().toISOString(),
      },
      "uid-customer-1",
    );
    expect(tooEarly.ok).toBe(false);

    // ---------------------------------------------------------------------
    // 7. A courier applies, is approved, and is added to the routing.
    // ---------------------------------------------------------------------
    const courierUid = `uid-courier-${Date.now()}`;
    const courierApplication = await createApplicationForUser(
      courierUid,
      "courier@example.com",
      {
        kind: "courier",
        businessName: "Pikipiki Express",
        contactName: "Juma Ally",
        phone: "0713222333",
        city: "Dar es Salaam",
        brandId: "",
        brandOther: "",
        address: "",
        deliveryMode: "",
        notes: "Two riders, same-day across the city.",
      },
    );
    expect(courierApplication.submitted).toBe(true);

    const courierPending = await db.partnerApplication.findFirst({
      where: { uid: courierUid },
      select: { id: true },
    });
    expect(await approveApplication(courierPending!.id, ADMIN)).toEqual({
      ok: true,
    });

    const courierPartner = await partnerForUser(courierUid);
    const courierLive = await activateCourierPartner(
      courierPartner!.partnerId,
      {
        name: "Pikipiki Express",
        city: "Dar es Salaam",
        regionsServed: [],
        etaMinDays: 0,
        etaMaxDays: 1,
        phone: null, // no published number, and the card says so
        verified: false,
      },
    );
    expect(courierLive.ok).toBe(true);
    if (!courierLive.ok) return;

    // ---------------------------------------------------------------------
    // 8. The customer orders, and it goes through.
    // ---------------------------------------------------------------------
    const order = await createOrder(
      {
        productId: published.value.productId,
        quantity: "1",
        fullName: "Neema Joseph",
        phone: "0754000111",
        address: "Mikocheni B",
        agentId: courierLive.value.agentId as string,
        reference: "",
        requestedAt: new Date().toISOString(),
      },
      "uid-customer-1",
    );
    expect(order).toEqual({ ok: true, value: expect.anything() });
    if (!order.ok) return;

    // ---------------------------------------------------------------------
    // 9. The branch sees it. This is the step that did not exist.
    // ---------------------------------------------------------------------
    const branchInbox = await listOrders({ branchId: wired!.branchId! }, 100);
    expect(branchInbox.map((o) => o.reference)).toContain(
      order.value.reference,
    );
    const seen = branchInbox.find((o) => o.reference === order.value.reference);
    expect(seen?.customerFullName).toBe("Neema Joseph");
    expect(seen?.customerPhone).toContain("754000111");

    // ---------------------------------------------------------------------
    // 10. And so does the courier who has to carry it.
    // ---------------------------------------------------------------------
    const courierInbox = await listOrders(
      { agentId: courierLive.value.agentId as string },
      100,
    );
    expect(courierInbox.map((o) => o.reference)).toContain(
      order.value.reference,
    );

    // ---------------------------------------------------------------------
    // 11. Nobody else does. A second branch's partner sees an empty inbox.
    // ---------------------------------------------------------------------
    const otherUid = `uid-other-${Date.now()}`;
    await createApplicationForUser(otherUid, "other@example.com", {
      kind: "brand",
      businessName: "Mwanza Motors",
      contactName: "Grace Paul",
      phone: "0715444555",
      city: "Mwanza",
      brandId: "",
      brandOther: "Mwanza Motors",
      // A brand application needs a real address to validate — the same rule
      // the form enforces. A blank one silently produced no application at all
      // here, which is exactly the kind of thing this file exists to notice.
      address: "Nyerere Road, Mwanza",
      deliveryMode: "customer_pays",
      notes: "",
    });
    const otherPending = await db.partnerApplication.findFirst({
      where: { uid: otherUid },
      select: { id: true },
    });
    await approveApplication(otherPending!.id, ADMIN);
    const otherPartner = await partnerForUser(otherUid);
    const otherLive = await activateBrandPartner(otherPartner!.partnerId, {
      brandId: null,
      brandName: "Mwanza Motors",
      category: "automotive",
      branchName: "Mwanza Motors — Mwanza",
      city: "Mwanza",
      addressLine: null,
      phone: null,
      hours: null,
      deliveryOffered: true,
      verified: false,
    });
    expect(otherLive.ok).toBe(true);
    if (!otherLive.ok) return;

    const strangerInbox = await listOrders(
      { branchId: otherLive.value.branchId as string },
      100,
    );
    // The customer's name, phone number and home address must not be here.
    expect(strangerInbox).toEqual([]);

    // ---------------------------------------------------------------------
    // 12. The order is verified with the branch and confirmed.
    //
    //     MalFleks admin moves it, not the branch — there is no partner-facing
    //     order queue in this codebase and this test does not pretend there
    //     is. See the note at the top of `src/server/orders/status.ts`.
    // ---------------------------------------------------------------------
    const orderId = order.value.id;

    expect(await confirmOrder(orderId, ADMIN)).toEqual({ ok: true });

    const confirmedInbox = await listOrders(
      { branchId: wired!.branchId!, status: "confirmed" },
      100,
    );
    expect(confirmedInbox.map((o) => o.reference)).toContain(
      order.value.reference,
    );

    // ---------------------------------------------------------------------
    // 13. It is delivered, and the request is complete.
    // ---------------------------------------------------------------------
    expect(await markOrderFulfilled(orderId, ADMIN)).toEqual({ ok: true });

    // Terminal in both directions. Neither of these is a hypothetical: two
    // admin tabs open on the same order is the ordinary way this happens.
    expect(await confirmOrder(orderId, ADMIN)).toEqual({
      ok: false,
      reason: "invalid-transition",
    });
    expect(await cancelOrder(orderId, ADMIN, "changed their mind")).toEqual({
      ok: false,
      reason: "invalid-transition",
    });

    // ---------------------------------------------------------------------
    // 14. And the whole sequence is on the record, in order.
    //
    //     `Order.decidedBy/decidedAt/decisionNote` only ever hold the *last*
    //     transition. The history is the part that survives the next one.
    // ---------------------------------------------------------------------
    const history = await orderHistory(orderId);
    expect(
      history.map((event) => [event.fromStatus, event.toStatus]),
    ).toEqual([
      ["pending", "confirmed"],
      ["confirmed", "fulfilled"],
    ]);
    // The two refused transitions above wrote nothing. A history that recorded
    // attempts would claim things happened that did not.
    expect(history).toHaveLength(2);
    expect(history.every((event) => event.actorUid === ADMIN)).toBe(true);

    // ---------------------------------------------------------------------
    // 15. The money. **Wired, but still unquotable for this order.**
    //
    //     `src/lib/fees` is now wired into `createOrder` — every order gets a
    //     quote snapshot attempt via `quoteForOrder`
    //     (`src/server/orders/quote-order.ts`), stored on `Order` itself
    //     rather than nowhere. MalFleks still takes no payment: this asserts
    //     what actually got stored for *this* order, not that nothing did.
    //
    //     This order is an agent route into Dar es Salaam, and the owner has
    //     not set a delivery fee for any city yet (`CITY_DELIVERY_FEES` in
    //     `src/lib/fees/tables.ts`), so the six quote columns below are null
    //     together — the honest outcome, not a bug. The moment the owner sets
    //     Dar es Salaam's fee, an order exactly like this one starts getting a
    //     real quote with no further code change. `quote-order.test.ts` proves
    //     that branch directly; this test proves the wiring reaches a real row
    //     in a real database.
    // ---------------------------------------------------------------------
    const settled = await db.order.findUniqueOrThrow({ where: { id: orderId } });

    expect(settled.lineTotalTZS).toBe(320_000);
    expect([
      settled.quoteGoodsRungTZS,
      settled.quoteDeliveryFeeTZS,
      settled.quoteDeliveryRungTZS,
      settled.quoteDepositTZS,
      settled.quoteDoorPaymentTZS,
      settled.quoteOrderTotalTZS,
    ]).toEqual([null, null, null, null, null, null]);

    // A real quote for this delivery cannot be produced at all: the four city
    // delivery fees are unset on purpose, and `quoteOrder` refuses rather than
    // returning a zero that would read as free delivery to the customer and as
    // "you owe nothing" to the courier.
    expect(() =>
      quoteOrder({
        goodsTotalTZS: settled.lineTotalTZS,
        city: "Dar es Salaam",
        routeKind: "agent",
      }),
    ).toThrow(FeeQuoteError);

    // With a fee supplied, the arithmetic reconciles exactly — to the shilling,
    // no tolerance, because every figure is a whole number of shillings. This
    // is the same pair of invariants `fees.test.ts` holds across the whole
    // catalogue; here it is held over one real order that a real branch really
    // fulfilled, which is the only thing this file adds to it.
    const fees: CityFeeTable = {
      "Dar es Salaam": 4_000,
      Arusha: null,
      Mwanza: null,
      Dodoma: null,
    };
    const quote = quoteOrder(
      {
        goodsTotalTZS: settled.lineTotalTZS,
        city: "Dar es Salaam",
        routeKind: "agent",
      },
      fees,
    );

    expect(quote.depositTZS + quote.doorPaymentTZS).toBe(quote.orderTotalTZS);
    // Every shilling the customer paid is somebody's money. This replaced
    // `branchPayout + courierPayout === doorPayment` on 6 Oct 2026, when the
    // quote started stating the courier's real share rather than the whole fee.
    expect(
      quote.branchPayoutTZS + quote.courierPayoutTZS + quote.malfleksEarnsTZS,
    ).toBe(quote.orderTotalTZS);
    // And what the courier would owe after ten of these, accruing per delivery
    // rather than per settlement batch.
    expect(
      accrueCourierBalance(Array<number>(10).fill(quote.deliveryFeeTZS)),
    ).toBe(quote.deliveryRungTZS * 10);

    // ---------------------------------------------------------------------
    // 16. Nothing about the delivered order moved any of it.
    //
    //     No payment was collected, nothing was written to the ledger, and no
    //     payout was batched. Delivering an order is not a money event; only a
    //     payment link that a customer actually pays is.
    //
    //     This used to assert that no payment/ledger/payout *tables existed* --
    //     true when MalFleks took no money at all, and a reasonable proxy for
    //     the intent then. Escrow added exactly those tables on 19 Sep 2026,
    //     the proxy went false, and nobody saw it because this suite needs a
    //     Postgres nobody had. The intent still holds and is still worth
    //     guarding, so it is now checked directly: by rows, for this order.
    // ---------------------------------------------------------------------
    const [payments, ledger, payouts] = await Promise.all([
      db.orderPayment.count({ where: { orderId } }),
      db.ledgerEntry.count({ where: { orderId } }),
      db.payoutBatch.count(),
    ]);
    expect({ payments, ledger, payouts }).toEqual({ payments: 0, ledger: 0, payouts: 0 });
  }, 120_000);
});
