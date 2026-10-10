// @vitest-environment node
//
// The decisions, without a database or a clock. Every rule that changes
// something has its "should I?" as a pure function, and this is where each
// branch of each one is pinned down -- above all the branches that say "no".

import { describe, expect, it } from "vitest";

import { autoRefundDecision, autoRefundReason, refundRefFor } from "@/server/money/refund-send";
import { RULES_ACTOR } from "@/server/orders/status";
import { FAILURES_BEFORE_DOWN, GATEWAY_STATE_FRESH_MINUTES, isFreshlyDown, nextGatewayState, type GatewayState } from "@/server/payments/gateway-state";
import { alertSms } from "./alerts";
import { RULEBOOK } from "./rulebook";
import { probeKind, recheckAfterMinutes } from "./rules/gateway";
import { lateCancelDue, unpaidCancelDue } from "./rules/orders";
import { shopsOverTheLine, type ShopFailure } from "./rules/shops";
import { HOUR_MS, SHOP_RELIABILITY, UNDELIVERED, UNPAID } from "./thresholds";

const NOW = new Date("2026-10-10T09:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR_MS);
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

describe("the rulebook itself", () => {
  it("gives every rule a unique key and words the owner can read", () => {
    const keys = RULEBOOK.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const rule of RULEBOOK) {
      expect(rule.title.length).toBeGreaterThan(5);
      expect(rule.when.length).toBeGreaterThan(20);
      expect(rule.then.length).toBeGreaterThan(20);
    }
  });

  it("finds out before it acts, and acts before it moves money", () => {
    const at = (key: string) => RULEBOOK.findIndex((r) => r.key === key);
    // ClickPesa's state is known before anything that depends on it.
    expect(at("gateway-watch")).toBe(0);
    // A payment the site was not told about is found before the order could be cancelled as unpaid.
    expect(at("payment-recheck")).toBeLessThan(at("unpaid-cancel"));
    // Everyone is warned before anything is cancelled.
    expect(at("unpaid-reminder")).toBeLessThan(at("unpaid-cancel"));
    expect(at("delivery-final-warning")).toBeLessThan(at("delivery-cancel"));
    // A cancellation in this pass can be refunded in this pass, and refunds go before payouts.
    expect(at("delivery-cancel")).toBeLessThan(at("refund-send"));
    expect(at("refund-send")).toBeLessThan(at("payout-send"));
  });

  it("marks exactly the rules that send money, and they all need ClickPesa", () => {
    const money = RULEBOOK.filter((r) => r.movesMoney);
    expect(money.map((r) => r.key).sort()).toEqual(["payout-send", "refund-send"]);
    expect(money.every((r) => r.needsGateway)).toBe(true);
    // A rule that moves money must stop when the rulebook is paused.
    expect(money.some((r) => r.alwaysRuns)).toBe(false);
  });
});

describe("is ClickPesa down?", () => {
  const up: GatewayState = { status: "up", since: hoursAgo(5).toISOString(), checkedAt: minutesAgo(15).toISOString(), failures: 0, detail: null, lastOutage: null };

  it("does not call one failure an outage", () => {
    const { state, change } = nextGatewayState(up, { ok: false, detail: "HTTP 404" }, NOW);
    expect(state.status).toBe("suspect");
    expect(change).toBeNull();
    expect(FAILURES_BEFORE_DOWN).toBe(2);
  });

  it("calls the second failure in a row an outage, dated from the first", () => {
    const first = nextGatewayState(up, { ok: false, detail: "HTTP 404" }, minutesAgo(15)).state;
    const { state, change } = nextGatewayState(first, { ok: false, detail: "HTTP 404" }, NOW);
    expect(state.status).toBe("down");
    expect(change).toBe("went-down");
    expect(state.since).toBe(minutesAgo(15).toISOString());
    expect(state.detail).toBe("HTTP 404");
  });

  it("announces an outage once, however long it lasts", () => {
    let state = nextGatewayState(nextGatewayState(up, { ok: false }, minutesAgo(30)).state, { ok: false }, minutesAgo(15)).state;
    const changes: unknown[] = [];
    for (let i = 0; i < 5; i += 1) {
      const next = nextGatewayState(state, { ok: false }, NOW);
      changes.push(next.change);
      state = next.state;
    }
    expect(changes).toEqual([null, null, null, null, null]);
    expect(state.failures).toBe(7);
  });

  it("forgets a single failure when the next check succeeds", () => {
    const suspect = nextGatewayState(up, { ok: false }, minutesAgo(15)).state;
    const { state, change } = nextGatewayState(suspect, { ok: true }, NOW);
    expect(state).toMatchObject({ status: "up", failures: 0, detail: null });
    expect(change).toBeNull();
  });

  it("says when it came back, and remembers the outage it came back from", () => {
    const down: GatewayState = { status: "down", since: hoursAgo(50).toISOString(), checkedAt: hoursAgo(1).toISOString(), failures: 60, detail: "HTTP 404", lastOutage: null };
    const { state, change } = nextGatewayState(down, { ok: true }, NOW);
    expect(change).toBe("came-back");
    expect(state.status).toBe("up");
    expect(state.lastOutage).toEqual({ since: down.since, until: NOW.toISOString() });
  });

  it("treats a first ever success as up, without announcing anything", () => {
    expect(nextGatewayState(null, { ok: true }, NOW)).toMatchObject({ state: { status: "up" }, change: null });
  });

  it("stops blocking the checkout when the reading is stale", () => {
    const down: GatewayState = { status: "down", since: hoursAgo(9).toISOString(), checkedAt: minutesAgo(GATEWAY_STATE_FRESH_MINUTES - 1).toISOString(), failures: 9, detail: null, lastOutage: null };
    expect(isFreshlyDown(down, NOW)).toBe(true);
    // The clock that would notice a recovery has stopped: stop turning customers away.
    expect(isFreshlyDown({ ...down, checkedAt: minutesAgo(GATEWAY_STATE_FRESH_MINUTES + 1).toISOString() }, NOW)).toBe(false);
    expect(isFreshlyDown(up, NOW)).toBe(false);
    expect(isFreshlyDown(null, NOW)).toBe(false);
  });
});

describe("when to spend an API call asking", () => {
  const state = (patch: Partial<GatewayState>): GatewayState => ({ status: "up", since: hoursAgo(5).toISOString(), checkedAt: minutesAgo(15).toISOString(), failures: 0, detail: null, lastOutage: null, ...patch });

  it("asks when it has never looked, and when one failure has been seen", () => {
    expect(probeKind(null, NOW, false)).toBe("ask");
    expect(probeKind(state({ status: "suspect" }), NOW, false)).toBe("ask");
  });

  it("does not ask while all is well and there is nothing to do", () => {
    expect(probeKind(state({}), NOW, false)).toBe("wait");
  });

  it("lets real work be the evidence while all is well", () => {
    expect(probeKind(state({}), NOW, true)).toBe("with-work");
  });

  it("checks an idle shop every few hours all the same", () => {
    expect(probeKind(state({ checkedAt: hoursAgo(4).toISOString() }), NOW, false)).toBe("ask");
  });

  it("asks on every pass when freshly down, then once an hour", () => {
    expect(probeKind(state({ status: "down", since: minutesAgo(45).toISOString(), checkedAt: minutesAgo(15).toISOString() }), NOW, false)).toBe("ask");
    const longDown = { status: "down" as const, since: hoursAgo(30).toISOString() };
    expect(probeKind(state({ ...longDown, checkedAt: minutesAgo(15).toISOString() }), NOW, true)).toBe("wait");
    expect(probeKind(state({ ...longDown, checkedAt: minutesAgo(61).toISOString() }), NOW, false)).toBe("ask");
  });

  it("a day of outage costs well under the day's allowance", () => {
    // Every pass for two hours (8), then hourly (22): thirty calls, not ninety-six.
    let current = state({ status: "down", since: NOW.toISOString(), checkedAt: NOW.toISOString() });
    let asked = 0;
    for (let pass = 1; pass <= 96; pass += 1) {
      const at = new Date(NOW.getTime() + pass * 15 * 60_000);
      if (probeKind(current, at, true) === "ask") {
        asked += 1;
        current = { ...current, checkedAt: at.toISOString() };
      }
    }
    expect(asked).toBeLessThanOrEqual(31);
    expect(asked).toBeGreaterThan(20);
  });
});

describe("how often an unpaid order is re-checked", () => {
  it("leaves the first half hour to the pay page, then looks rarely, and not at all once the cancel rule owns it", () => {
    expect(recheckAfterMinutes(0)).toBeNull();
    expect(recheckAfterMinutes(30 * 60_000 - 1)).toBeNull();
    expect(recheckAfterMinutes(30 * 60_000)).toBe(120);
    expect(recheckAfterMinutes(3 * HOUR_MS - 1)).toBe(120);
    expect(recheckAfterMinutes(3 * HOUR_MS)).toBe(360);
    expect(recheckAfterMinutes(UNPAID.cancelAfterHours * HOUR_MS - 1)).toBe(360);
    expect(recheckAfterMinutes(UNPAID.cancelAfterHours * HOUR_MS)).toBeNull();
  });

  it("looks at one abandoned order only a handful of times in its day", () => {
    // Walk a day of passes for an order nobody ever pays for.
    let lastChecked: number | null = null;
    let looks = 0;
    for (let age = 0; age < UNPAID.cancelAfterHours * HOUR_MS; age += 15 * 60_000) {
      const every = recheckAfterMinutes(age);
      if (every != null && (lastChecked == null || age - lastChecked >= every * 60_000)) {
        looks += 1;
        lastChecked = age;
      }
    }
    expect(looks).toBeLessThanOrEqual(5);
    expect(looks).toBeGreaterThanOrEqual(3);
  });
});

describe("cancelling an unpaid order", () => {
  const base = { payableSince: hoursAgo(25), remindedAt: hoursAgo(24), payableAgainSince: null };

  it("cancels after a day when the customer was reminded", () => {
    expect(unpaidCancelDue(base, NOW)).toBe(true);
  });

  it("never cancels before the deadline", () => {
    expect(unpaidCancelDue({ ...base, payableSince: hoursAgo(UNPAID.cancelAfterHours - 1) }, NOW)).toBe(false);
  });

  it("never cancels an order that has not been reminded -- the first pass after go-live included", () => {
    // Three days old, and this is the first time the rulebook has ever run.
    expect(unpaidCancelDue({ ...base, payableSince: hoursAgo(72), remindedAt: null }, NOW)).toBe(false);
  });

  it("gives the customer time after a late reminder", () => {
    expect(unpaidCancelDue({ ...base, payableSince: hoursAgo(72), remindedAt: hoursAgo(UNPAID.minHoursAfterReminder - 1) }, NOW)).toBe(false);
    expect(unpaidCancelDue({ ...base, payableSince: hoursAgo(72), remindedAt: hoursAgo(UNPAID.minHoursAfterReminder) }, NOW)).toBe(true);
  });

  it("cancels an order too old to be reminded about, without one", () => {
    expect(unpaidCancelDue({ ...base, payableSince: hoursAgo(UNPAID.remindWithinDays * 24 + 1), remindedAt: null }, NOW)).toBe(true);
  });

  it("does not count time when nobody could pay", () => {
    // ClickPesa came back two hours ago; this customer has had two hours, not twenty-five.
    expect(unpaidCancelDue({ ...base, payableAgainSince: hoursAgo(2) }, NOW)).toBe(false);
    expect(unpaidCancelDue({ ...base, payableAgainSince: hoursAgo(UNPAID.minHoursAfterReminder) }, NOW)).toBe(true);
    // An order placed after the outage ended is not affected by it.
    expect(unpaidCancelDue({ ...base, payableSince: hoursAgo(25), payableAgainSince: hoursAgo(26) }, NOW)).toBe(true);
  });
});

describe("cancelling a paid order the shop did not deliver", () => {
  const base = { paidAt: hoursAgo(UNDELIVERED.cancelAfterHours + 1), warnedAt: hoursAgo(UNDELIVERED.minHoursAfterFinalWarning + 1), withAdmin: false, moving: false, ownerHandling: false };

  it("cancels after the deadline when the shop was warned in time", () => {
    expect(lateCancelDue(base, NOW)).toBe(true);
  });

  it("never before the deadline", () => {
    expect(lateCancelDue({ ...base, paidAt: hoursAgo(UNDELIVERED.cancelAfterHours - 1) }, NOW)).toBe(false);
  });

  it("never without a warning, and never sooner than a day after it", () => {
    expect(lateCancelDue({ ...base, warnedAt: null }, NOW)).toBe(false);
    expect(lateCancelDue({ ...base, warnedAt: hoursAgo(UNDELIVERED.minHoursAfterFinalWarning - 1) }, NOW)).toBe(false);
    // Ten days late, warned an hour ago (the first pass after go-live): still waits.
    expect(lateCancelDue({ ...base, paidAt: hoursAgo(240), warnedAt: hoursAgo(1) }, NOW)).toBe(false);
  });

  it("stands back whenever a person knows something the clock does not", () => {
    expect(lateCancelDue({ ...base, withAdmin: true }, NOW)).toBe(false);
    expect(lateCancelDue({ ...base, moving: true }, NOW)).toBe(false);
    expect(lateCancelDue({ ...base, ownerHandling: true }, NOW)).toBe(false);
  });
});

describe("which cancellations are refunded without a person", () => {
  const paid = hoursAgo(30);
  const order = { status: "cancelled", decidedBy: "uid-admin", decidedAt: hoursAgo(2), capturedAt: paid, decidedByPartner: false };

  it("the shop declined a paid order", () => {
    expect(autoRefundReason({ ...order, decidedBy: "uid-shop", decidedByPartner: true })).toBe("shop-declined");
  });

  it("the rulebook cancelled it for lateness", () => {
    expect(autoRefundReason({ ...order, decidedBy: RULES_ACTOR })).toBe("deadline");
  });

  it("the money arrived after the order was already cancelled, whoever cancelled it", () => {
    expect(autoRefundReason({ ...order, decidedAt: hoursAgo(40) })).toBe("paid-after-cancel");
  });

  it("not an order an admin cancelled -- how much to refund is his decision", () => {
    expect(autoRefundReason(order)).toBeNull();
  });

  it("not an order that is not cancelled, or was never paid", () => {
    expect(autoRefundReason({ ...order, status: "confirmed", decidedBy: RULES_ACTOR })).toBeNull();
    expect(autoRefundReason({ ...order, decidedBy: RULES_ACTOR, capturedAt: null })).toBeNull();
  });
});

describe("whether a refund may be sent now", () => {
  const config = { maxPerPayoutTZS: 500_000, maxPerDayTZS: 2_000_000 };
  const input = { reason: "deadline" as const, collectedTZS: 50_000, refundedTZS: 0, splitTZS: 0, hasOpenSend: false, hasEarlierSend: false, phone: "255754123456" };

  it("sends everything that was collected", () => {
    expect(autoRefundDecision(input, config, 0)).toEqual({ send: true, amountTZS: 50_000 });
  });

  it.each([
    ["no qualifying reason", { reason: null }, "needs-a-person"],
    ["one already in flight", { hasOpenSend: true }, "already-open"],
    ["one tried before", { hasEarlierSend: true }, "tried-before"],
    ["part already refunded by hand", { refundedTZS: 10_000 }, "touched-by-hand"],
    ["money already split", { splitTZS: 1 }, "touched-by-hand"],
    ["no wallet number", { phone: null }, "no-number"],
    ["under ClickPesa's minimum", { collectedTZS: 2_000 }, "below-minimum"],
    ["over the per-send ceiling", { collectedTZS: 500_001 }, "above-ceiling"],
  ])("does not send with %s", (_name, patch, reason) => {
    expect(autoRefundDecision({ ...input, ...patch }, config, 0)).toEqual({ send: false, reason });
  });

  it("counts toward the same daily ceiling as partner payouts", () => {
    expect(autoRefundDecision(input, config, 1_960_000)).toEqual({ send: false, reason: "daily-ceiling" });
    expect(autoRefundDecision(input, config, 1_950_000)).toEqual({ send: true, amountTZS: 50_000 });
  });

  it("names a refund so it cannot be mistaken for a partner payout", () => {
    expect(refundRefFor("cmg1abc-_de")).toBe("RCMG1ABCDE");
  });
});

describe("a shop over the line", () => {
  const failure = (branchId: string, orderId: string, h: number): ShopFailure => ({ branchId, orderId, decidedAt: hoursAgo(h) });

  it("needs the full number of failures", () => {
    const two = [failure("a", "1", 5), failure("a", "2", 4)];
    expect(shopsOverTheLine(two, new Map()).size).toBe(0);
    const three = [...two, failure("a", "3", 3)];
    expect([...shopsOverTheLine(three, new Map()).keys()]).toEqual(["a"]);
    expect(SHOP_RELIABILITY.failures).toBe(3);
  });

  it("counts each shop separately", () => {
    const mixed = [failure("a", "1", 5), failure("a", "2", 4), failure("b", "3", 3), failure("b", "4", 2)];
    expect(shopsOverTheLine(mixed, new Map()).size).toBe(0);
  });

  it("does not hide a shop again for failures the owner has already answered for", () => {
    const three = [failure("a", "1", 50), failure("a", "2", 40), failure("a", "3", 30)];
    // He restored the shop a day ago.
    expect(shopsOverTheLine(three, new Map([["a", hoursAgo(24)]])).size).toBe(0);
    // Three more since then: over the line again.
    const again = [...three, failure("a", "4", 10), failure("a", "5", 5), failure("a", "6", 1)];
    expect(shopsOverTheLine(again, new Map([["a", hoursAgo(24)]])).get("a")?.map((f) => f.orderId)).toEqual(["4", "5", "6"]);
  });
});

describe("the text message for an urgent alert", () => {
  it("is one plain-ASCII message", () => {
    const text = alertSms("ClickPesa is not answering — customers cannot pay");
    expect(text).toBe("MalFleks: ClickPesa is not answering - customers cannot pay Check your email.");
    expect(/^[\x20-\x7E]+$/.test(text)).toBe(true);
  });

  it("is cut to one message when the subject is long", () => {
    const text = alertSms("x".repeat(400));
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text.endsWith("... Check your email.")).toBe(true);
  });
});
