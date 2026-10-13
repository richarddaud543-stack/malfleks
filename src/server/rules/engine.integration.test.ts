// @vitest-environment node
//
// The whole rulebook against a real Postgres, with stand-ins for the three
// things it reaches outside for: ClickPesa, email and text messages.
//
// What is being proved is the owner's sentence: "make it work when I am not
// around". So the tests are stories told in passes -- an order is placed, the
// clock moves, a pass runs -- and each asserts both halves of a rule: that it
// acts when its condition holds, and that it does NOT act a moment before, or
// twice, or when a person has said to leave it alone.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---- ClickPesa ------------------------------------------------------------
const checkGateway = vi.fn();
const queryPaymentStatus = vi.fn();
const generateCheckoutLink = vi.fn();
const previewMobilePayout = vi.fn();
const createMobilePayout = vi.fn();
const queryPayoutStatus = vi.fn();
const getAccountBalance = vi.fn();
/** Every stand-in call counts, exactly as every real request does. */
let clickPesaCalls = 0;
function counted<T extends unknown[], R>(fn: (...args: T) => R) {
  return (...args: T): R => {
    clickPesaCalls += 1;
    return fn(...args);
  };
}
vi.mock("@/server/payments/clickpesa", async (original) => ({
  ...(await original<typeof import("@/server/payments/clickpesa")>()),
  clickPesaCallCount: () => clickPesaCalls,
  checkGateway: counted((options?: unknown) => checkGateway(options)),
  queryPaymentStatus: counted((ref: string) => queryPaymentStatus(ref)),
  generateCheckoutLink: counted((input: unknown) => generateCheckoutLink(input)),
  previewMobilePayout: counted((input: unknown) => previewMobilePayout(input)),
  createMobilePayout: counted((input: unknown) => createMobilePayout(input)),
  queryPayoutStatus: counted((ref: string) => queryPayoutStatus(ref)),
  getAccountBalance: counted(() => getAccountBalance()),
}));

// ---- Email, text messages, and the shop's cache ---------------------------
const sendCustomerEmail = vi.fn();
const sendPartnerEmail = vi.fn();
const sendNotification = vi.fn();
vi.mock("@/server/notify/email", async (original) => ({
  ...(await original<typeof import("@/server/notify/email")>()),
  sendCustomerEmail: (...args: unknown[]) => sendCustomerEmail(...args),
  sendPartnerEmail: (...args: unknown[]) => sendPartnerEmail(...args),
  sendNotification: (...args: unknown[]) => sendNotification(...args),
}));
const sendSms = vi.fn();
vi.mock("@/server/notify/sms", async (original) => ({
  ...(await original<typeof import("@/server/notify/sms")>()),
  sendSms: (...args: unknown[]) => sendSms(...args),
}));
const notifyPublicSiteOfCatalogueChange = vi.fn();
vi.mock("@/server/revalidate-public-site", () => ({
  notifyPublicSiteOfCatalogueChange: () => notifyPublicSiteOfCatalogueChange(),
}));

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { requestPaymentForOrder } from "@/server/orders/create-order-with-payment";
import { reportDeliveryProblem } from "@/server/orders/delivery-code";
import { declineOrder, RULES_ACTOR } from "@/server/orders/status";
import { readGatewayState } from "@/server/payments/gateway-state";
import { markAlertHandling, resolveAlert } from "./alerts";
import { clockStatus, runRulebook } from "./engine";
import { paidOrder, PAYER, placedOrder, resetRulebookTables, SHOP, shopUser, unpaidOrder } from "./fixtures.test-helper";
import { RULEBOOK } from "./rulebook";
import { restoreHiddenListings } from "./rules/shops";
import { setRuleOff, setRulebookPaused } from "./settings";
import { DEFAULT_API_DAILY_BUDGET, HOUR_MS, MAX_CALLS_PER_PASS, SHOP_RELIABILITY, SHOP_VERIFICATION, UNDELIVERED, UNPAID } from "./thresholds";
import { markShopVerified } from "@/server/partners/verification";
import type { Rule } from "./types";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("rulebook");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

/**
 * 13:00 on a Saturday in Dar es Salaam: after the morning summary's hour.
 *
 * Deliberately weeks before the day these tests can actually run. A few
 * timestamps are written by code that has no business taking a clock as an
 * argument (when an order was cancelled, when a pay link was made) and so
 * carry the real time; with `NOW` in the past those always fall *after* the
 * fixtures' own times, which is the order they happen in for real.
 */
const NOW = new Date("2026-09-05T10:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR_MS);
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * HOUR_MS);
const PASS_MS = 15 * 60_000;

/** A deployment with ClickPesa set up and money sending switched off. */
const SITE = { CLICKPESA_CLIENT_ID: "id", CLICKPESA_API_KEY: "key", MALFLEKS_OWNER_PHONE: "0754999888" };
/** The same, with money sending on. */
const SENDING = { ...SITE, AUTO_PAYOUTS: "on" };

const ORDER_TZS = 50_000;
const NOT_PAID = { ok: true, found: false } as const;

beforeEach(async () => {
  await resetRulebookTables();
  vi.clearAllMocks();
  clickPesaCalls = 0;
  checkGateway.mockResolvedValue({ ok: true, asked: true });
  queryPaymentStatus.mockResolvedValue(NOT_PAID);
  generateCheckoutLink.mockResolvedValue({ ok: true, checkoutLink: "https://pay.example/link" });
  previewMobilePayout.mockResolvedValue({ ok: true, feeTZS: 1_000, totalTZS: ORDER_TZS + 1_000, balanceTZS: 900_000, receiverName: "ASHA", provider: "MPESA" });
  createMobilePayout.mockResolvedValue({ ok: true, record: { status: "SUCCESS", id: "CPOUT1", orderReference: null, feeTZS: 1_000 } });
  queryPayoutStatus.mockResolvedValue(NOT_PAID);
  getAccountBalance.mockResolvedValue({ ok: true, balanceTZS: 900_000 });
  sendCustomerEmail.mockResolvedValue({ sent: true });
  sendPartnerEmail.mockResolvedValue({ sent: true });
  sendNotification.mockResolvedValue({ sent: true });
  sendSms.mockResolvedValue({ sent: true });
});

/** One pass of the timer at `now`. The daily summary is switched off unless a test is about it. */
async function pass(now: Date = NOW, env: Record<string, string | undefined> = SITE, trigger: "timer" | "daily" | "manual" = "timer") {
  // The cancellation emails ask "will this refund be automatic?" of the real
  // environment, as they do in production, so it has to agree with `env`.
  const before = process.env.AUTO_PAYOUTS;
  if (env.AUTO_PAYOUTS) process.env.AUTO_PAYOUTS = env.AUTO_PAYOUTS;
  else delete process.env.AUTO_PAYOUTS;
  try {
    return await runRulebook(trigger, { now, env });
  } finally {
    if (before === undefined) delete process.env.AUTO_PAYOUTS;
    else process.env.AUTO_PAYOUTS = before;
  }
}

const order = (id: string) => getPrisma().order.findUniqueOrThrow({ where: { id } });
const alerts = () => getPrisma().ownerAlert.findMany({ orderBy: { createdAt: "asc" } });
/** Subjects of emails to a customer or a partner: `(to, subject, body)`. */
const subjects = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.map((call) => String(call[1]));
/** Subjects of emails to the owner's own inbox: `(subject, body)`. */
const ownerSubjects = () => sendNotification.mock.calls.map((call) => String(call[0]));
/** Forget what fixtures and earlier passes sent, so a test counts only what comes next. */
function forgetMessages() {
  for (const mock of [sendCustomerEmail, sendPartnerEmail, sendNotification, sendSms]) mock.mockClear();
}
const noteOf = (run: Awaited<ReturnType<typeof runRulebook>>, key: string) => run.outcomes.find((o) => o.key === key);

beforeEach(async () => {
  // Most stories are not about the morning email; the ones that are switch it on.
  await setRuleOff("daily-summary", true, "test");
});

// ---------------------------------------------------------------------------
describe("the engine", () => {
  const quiet: Rule = { key: "quiet", group: "owner", title: "Quiet rule", when: "never", then: "nothing", run: async () => ({ acted: 0, notes: [] }) };
  const busy: Rule = { key: "busy", group: "owner", title: "Busy rule", when: "always", then: "one thing", run: async () => ({ acted: 1, notes: ["Did one thing."] }) };
  const broken: Rule = {
    key: "broken",
    group: "owner",
    title: "Broken rule",
    when: "always",
    then: "throws",
    run: async () => {
      throw new Error("the database fell over");
    },
  };

  it("records every pass, including one in which nothing needed doing", async () => {
    const run = await runRulebook("timer", { now: NOW, env: SITE, rules: [quiet] });

    expect(run).toMatchObject({ ok: true, acted: 0, errors: 0, summary: "Nothing needed doing." });
    const rows = await getPrisma().ruleRun.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ trigger: "timer", acted: 0, errors: 0 });
  });

  it("a rule that throws does not stop the rules after it, and the owner is told once", async () => {
    const first = await runRulebook("timer", { now: NOW, env: SITE, rules: [broken, busy] });

    expect(first.ok).toBe(false);
    expect(first.errors).toBe(1);
    expect(noteOf(first, "broken")?.error).toBe("the database fell over");
    expect(noteOf(first, "busy")).toMatchObject({ acted: 1, notes: ["Did one thing."] });

    await runRulebook("timer", { now: new Date(NOW.getTime() + PASS_MS), env: SITE, rules: [broken, busy] });
    const raised = await alerts();
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ key: "rule-failed", urgency: "routine", status: "open" });
    expect(raised[0].subject).toContain("Broken rule");
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("takes the alarm down by itself once the rule works again", async () => {
    await runRulebook("timer", { now: NOW, env: SITE, rules: [broken] });
    const mended: Rule = { ...broken, run: async () => ({ acted: 0, notes: [] }) };

    await runRulebook("timer", { now: new Date(NOW.getTime() + PASS_MS), env: SITE, rules: [mended] });

    expect((await alerts()).map((a) => a.status)).toEqual(["resolved"]);
  });

  it("an error in a rule that moves money is urgent, and texted", async () => {
    await runRulebook("timer", { now: NOW, env: SITE, rules: [{ ...broken, movesMoney: true }] });

    expect((await alerts())[0].urgency).toBe("urgent");
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendSms.mock.calls[0][0]).toBe(SITE.MALFLEKS_OWNER_PHONE);
  });

  it("two passes at the same moment: one runs, the other is turned away", async () => {
    let running = 0;
    let overlapped = false;
    const slow: Rule = {
      ...busy,
      run: async () => {
        running += 1;
        if (running > 1) overlapped = true;
        await new Promise((resolve) => setTimeout(resolve, 150));
        running -= 1;
        return { acted: 1, notes: ["Did one thing."] };
      },
    };

    const runs = await Promise.all([1, 2, 3].map(() => runRulebook("timer", { now: NOW, env: SITE, rules: [slow] })));

    expect(overlapped).toBe(false);
    expect(runs.filter((r) => r.skipped === "busy")).toHaveLength(2);
    expect(runs.filter((r) => r.acted === 1)).toHaveLength(1);
    expect(await getPrisma().ruleRun.count()).toBe(1);
  });

  it("lets the next pass in once the first has finished", async () => {
    await runRulebook("timer", { now: NOW, env: SITE, rules: [busy] });
    const next = await runRulebook("timer", { now: new Date(NOW.getTime() + 1_000), env: SITE, rules: [busy] });

    expect(next.skipped).toBeUndefined();
    expect(next.acted).toBe(1);
  });

  it("a pass that died holding the lease does not block the rulebook for ever", async () => {
    // A lease left behind by a pass the platform killed: it expires by itself.
    await getPrisma().appSetting.create({ data: { key: "rulebookLease", value: new Date(NOW.getTime() + 60_000).toISOString() } });

    expect((await runRulebook("timer", { now: NOW, env: SITE, rules: [busy] })).skipped).toBe("busy");
    expect((await runRulebook("timer", { now: new Date(NOW.getTime() + 2 * 60_000), env: SITE, rules: [busy] })).acted).toBe(1);
  });

  it("when paused, runs only the rules that watch", async () => {
    await setRulebookPaused(true, "admin-1");
    const watcher: Rule = { ...busy, key: "watcher", alwaysRuns: true };

    const run = await runRulebook("timer", { now: NOW, env: SITE, rules: [watcher, busy] });

    expect(noteOf(run, "watcher")?.acted).toBe(1);
    expect(noteOf(run, "busy")).toMatchObject({ acted: 0, skipped: "paused" });
  });

  it("skips a rule the owner switched off, and only that rule", async () => {
    await setRuleOff("busy", true, "admin-1");

    const run = await runRulebook("timer", { now: NOW, env: SITE, rules: [busy, { ...busy, key: "other" }] });

    expect(noteOf(run, "busy")?.skipped).toBe("off");
    expect(noteOf(run, "other")?.acted).toBe(1);
  });

  it("does not run a rule that needs ClickPesa when ClickPesa is not known to be up", async () => {
    const needy: Rule = { ...busy, key: "needy", needsGateway: true };

    const run = await runRulebook("timer", { now: NOW, env: SITE, rules: [needy] });

    expect(noteOf(run, "needy")?.skipped).toBe("no-gateway");
  });

  it("gives a pass a limited number of ClickPesa calls, and the day a limited number of passes' worth", async () => {
    const seen: number[] = [];
    const greedy: Rule = {
      ...quiet,
      key: "greedy",
      run: async (ctx) => {
        seen.push(ctx.callsLeft());
        clickPesaCalls += 3;
        seen.push(ctx.callsLeft());
        return { acted: 0, notes: [] };
      },
    };

    const run = await runRulebook("timer", { now: NOW, env: SITE, rules: [greedy] });
    expect(seen).toEqual([MAX_CALLS_PER_PASS, MAX_CALLS_PER_PASS - 3]);
    expect(run.apiCalls).toBe(3);

    // The day's allowance is nearly spent: the next pass gets only what is left of it.
    await getPrisma().ruleRun.create({ data: { trigger: "timer", startedAt: hoursAgo(1), finishedAt: hoursAgo(1), apiCalls: DEFAULT_API_DAILY_BUDGET - 3 - 2, summary: "", results: [] } });
    seen.length = 0;
    await runRulebook("timer", { now: new Date(NOW.getTime() + PASS_MS), env: SITE, rules: [greedy] });
    expect(seen).toEqual([2, 0]);

    // RULES_API_DAILY_BUDGET overrides the default.
    seen.length = 0;
    await runRulebook("timer", { now: new Date(NOW.getTime() + 2 * PASS_MS), env: { ...SITE, RULES_API_DAILY_BUDGET: "0" }, rules: [greedy] });
    expect(seen).toEqual([0, 0]);
  });

  it("the real rulebook runs clean on an empty shop and asks ClickPesa once", async () => {
    const run = await pass();

    expect(run).toMatchObject({ ok: true, errors: 0 });
    expect(run.outcomes.map((o) => o.key)).toEqual(RULEBOOK.map((r) => r.key));
    expect(run.outcomes.filter((o) => o.error)).toEqual([]);
    // Never observed before, so it asks; everything else found nothing to do.
    expect(run.apiCalls).toBe(1);
  });

  it("a quiet shop costs almost nothing: a day of passes makes only the occasional check", async () => {
    for (let i = 0; i < 96; i += 1) await pass(new Date(NOW.getTime() + i * PASS_MS));

    // One every three hours while idle.
    expect(clickPesaCalls).toBeLessThanOrEqual(9);
    expect((await clockStatus(new Date(NOW.getTime() + 96 * PASS_MS), SITE)).timerPassesToday).toBe(96);
  });
});

describe("the day's ClickPesa allowance", () => {
  it("is not used up by orders nobody pays for: three abandoned orders cost a day well under the budget", async () => {
    for (let i = 0; i < 3; i += 1) await unpaidOrder(hoursAgo(0.1));

    // A day and a bit of passes: reminded, re-checked, and finally cancelled.
    for (let i = 0; i < 104; i += 1) await pass(new Date(NOW.getTime() + i * PASS_MS));

    expect(await getPrisma().order.count({ where: { status: "cancelled" } })).toBe(3);
    const spent = await getPrisma().ruleRun.aggregate({ _sum: { apiCalls: true } });
    expect(spent._sum.apiCalls).toBeLessThan(DEFAULT_API_DAILY_BUDGET / 2);
    expect(sendCustomerEmail).toHaveBeenCalledTimes(6);
  });
});

// ---------------------------------------------------------------------------
describe("ClickPesa stops answering", () => {
  const down = () => checkGateway.mockResolvedValue({ ok: false, detail: "ClickPesa generate-token failed: HTTP 404" });

  it("says nothing after one failure, and tells the owner at once after the second", async () => {
    down();

    await pass(NOW);
    expect(await alerts()).toEqual([]);
    expect((await readGatewayState())?.status).toBe("suspect");

    const second = await pass(new Date(NOW.getTime() + PASS_MS));
    const raised = await alerts();
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ key: "gateway-down", urgency: "urgent" });
    expect(raised[0].body).toContain("HTTP 404");
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(String(sendSms.mock.calls[0][1])).toContain("ClickPesa is not answering");
    expect(second.summary).toContain("ClickPesa is DOWN");
  });

  it("tells him once, not ninety-six times", async () => {
    down();
    for (let i = 0; i < 12; i += 1) await pass(new Date(NOW.getTime() + i * PASS_MS));

    expect(await alerts()).toHaveLength(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledTimes(1);
  });

  it("stops sending customers to a pay link that cannot be made", async () => {
    down();
    await pass(NOW);
    await pass(new Date(NOW.getTime() + PASS_MS));
    const placed = await placedOrder();
    vi.clearAllMocks();
    // The pay page asks the wall clock whether that reading is still fresh, so
    // stamp it as taken just now -- which, in production, it would have been.
    const reading = await getPrisma().appSetting.findUniqueOrThrow({ where: { key: "paymentsGateway" } });
    await getPrisma().appSetting.update({ where: { key: "paymentsGateway" }, data: { value: JSON.stringify({ ...JSON.parse(reading.value), checkedAt: new Date().toISOString() }) } });

    const outcome = await requestPaymentForOrder(placed.id);

    expect(outcome).toEqual({ ok: false, reason: "checkout-link-failed" });
    expect(generateCheckoutLink).not.toHaveBeenCalled();
  });

  it("does not cancel unpaid orders, or remind anyone to pay, while nobody can pay", async () => {
    const unpaid = await unpaidOrder(hoursAgo(30));
    await getPrisma().ruleMark.create({ data: { ruleKey: "unpaid-reminder", subjectId: unpaid.id, createdAt: hoursAgo(29) } });
    down();

    await pass(NOW);
    const run = await pass(new Date(NOW.getTime() + PASS_MS));

    expect(noteOf(run, "unpaid-cancel")?.skipped).toBe("no-gateway");
    expect((await order(unpaid.id)).status).toBe("pending");
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("when it comes back: the alarm closes, and every order that missed a pay link gets one by email", async () => {
    down();
    await pass(NOW);
    await pass(new Date(NOW.getTime() + PASS_MS));
    const stranded = await placedOrder({ createdAt: new Date(NOW.getTime() + 20 * 60_000) });
    forgetMessages();

    checkGateway.mockResolvedValue({ ok: true, asked: true });
    const back = await pass(new Date(NOW.getTime() + 2 * PASS_MS));

    expect(back.summary).toContain("ClickPesa is back");
    expect((await alerts()).map((a) => a.status)).toEqual(["resolved"]);
    expect(await getPrisma().orderPayment.count({ where: { orderId: stranded.id } })).toBe(1);
    expect(subjects(sendCustomerEmail)).toHaveLength(1);
    expect(subjects(sendCustomerEmail)[0]).toContain("You can now pay");

    // And not again on the next pass.
    await pass(new Date(NOW.getTime() + 3 * PASS_MS));
    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
  });

  it("does not ask for a link ClickPesa keeps refusing on every pass -- only every few hours", async () => {
    await placedOrder({ createdAt: hoursAgo(2) });
    generateCheckoutLink.mockResolvedValue({ ok: false, reason: "request-failed", detail: "HTTP 500" });

    await pass(NOW);
    await pass(new Date(NOW.getTime() + PASS_MS));
    await pass(new Date(NOW.getTime() + 2 * PASS_MS));
    expect(generateCheckoutLink).toHaveBeenCalledTimes(1);

    await pass(hoursFromNow(3.25));
    expect(generateCheckoutLink).toHaveBeenCalledTimes(2);
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("gives customers who could not pay during the outage time to pay after it", async () => {
    const unpaid = await unpaidOrder(hoursAgo(30));
    await getPrisma().ruleMark.create({ data: { ruleKey: "unpaid-reminder", subjectId: unpaid.id, createdAt: hoursAgo(29) } });
    down();
    await pass(NOW);
    await pass(new Date(NOW.getTime() + PASS_MS));
    checkGateway.mockResolvedValue({ ok: true, asked: true });

    await pass(new Date(NOW.getTime() + 2 * PASS_MS));
    expect((await order(unpaid.id)).status).toBe("pending");

    await pass(hoursFromNow(UNPAID.minHoursAfterReminder + 1));
    expect((await order(unpaid.id)).status).toBe("cancelled");
  });

  it("does nothing that needs ClickPesa on a deployment without its keys, and says so", async () => {
    const run = await pass(NOW, {});

    expect(checkGateway).not.toHaveBeenCalled();
    expect(noteOf(run, "gateway-watch")?.notes[0]).toContain("keys are not set");
    expect(noteOf(run, "payment-recheck")?.skipped).toBe("no-gateway");
  });

  it("when the day's allowance is spent it stops asking, says so once, and does not call that an outage", async () => {
    await getPrisma().ruleRun.create({ data: { trigger: "timer", startedAt: hoursAgo(1), finishedAt: hoursAgo(1), apiCalls: DEFAULT_API_DAILY_BUDGET, summary: "", results: [] } });

    await pass(NOW);
    await pass(new Date(NOW.getTime() + PASS_MS));

    expect(clickPesaCalls).toBe(0);
    expect(await readGatewayState()).toBeNull();
    const raised = await alerts();
    expect(raised.map((a) => [a.key, a.urgency])).toEqual([["api-budget-spent", "routine"]]);
    expect(sendSms).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("an order nobody pays for", () => {
  it("is left alone for the first hour", async () => {
    const unpaid = await unpaidOrder(hoursAgo(0.5));

    await pass();

    expect(sendCustomerEmail).not.toHaveBeenCalled();
    expect((await order(unpaid.id)).status).toBe("pending");
  });

  it("gets one reminder after an hour, saying how long is left", async () => {
    await unpaidOrder(hoursAgo(UNPAID.remindAfterHours + 0.25));

    await pass(NOW);
    await pass(new Date(NOW.getTime() + PASS_MS));
    await pass(new Date(NOW.getTime() + 2 * PASS_MS));

    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = sendCustomerEmail.mock.calls[0];
    expect(to).toBe("asha@example.com");
    expect(subject).toContain("inasubiri malipo");
    expect(subject).toContain("is waiting for payment");
    expect(body).toContain("within the next 23 hours");
    expect(body).toContain("/pay/");
  });

  it("is not cancelled one pass before the deadline, and is cancelled at it", async () => {
    const placedAt = hoursAgo(UNPAID.remindAfterHours + 0.25);
    const unpaid = await unpaidOrder(placedAt);
    await pass(NOW);
    const deadline = new Date(placedAt.getTime() + UNPAID.cancelAfterHours * HOUR_MS);
    forgetMessages();

    await pass(new Date(deadline.getTime() - PASS_MS));
    expect((await order(unpaid.id)).status).toBe("pending");

    const run = await pass(new Date(deadline.getTime() + 60_000));
    const cancelled = await order(unpaid.id);
    expect(cancelled).toMatchObject({ status: "cancelled", decidedBy: RULES_ACTOR });
    expect(cancelled.decisionNote).toContain("Not paid within 24 hours");
    expect(run.summary).toContain(`Cancelled ${unpaid.reference}`);
    // The customer is told, and told nothing was charged.
    expect(subjects(sendCustomerEmail)).toHaveLength(1);
    expect(String(sendCustomerEmail.mock.calls[0][2])).toContain("You have not been charged");
  });

  it("asks ClickPesa one last time, and does not cancel an order that turns out to be paid", async () => {
    const unpaid = await unpaidOrder(hoursAgo(25));
    await getPrisma().ruleMark.create({ data: { ruleKey: "unpaid-reminder", subjectId: unpaid.id, createdAt: hoursAgo(24) } });
    // The webhook never arrived; ClickPesa itself knows the customer paid.
    queryPaymentStatus.mockResolvedValue({
      ok: true,
      found: true,
      records: [{ status: "SUCCESS", paymentReference: "CPLATE1", orderReference: null, collectedAmount: ORDER_TZS, message: null, updatedAt: null, payerPhone: PAYER }],
    });

    await pass();

    const now = await order(unpaid.id);
    expect(now.status).toBe("confirmed");
    expect(await getPrisma().orderPayment.count({ where: { orderId: unpaid.id, status: "captured", payerPhone: PAYER } })).toBe(1);
  });

  it.each([
    ["a payment is in progress", { ok: true, found: true, records: [{ status: "PROCESSING", paymentReference: null, orderReference: null, collectedAmount: null, message: null, updatedAt: null }] }],
    ["the check itself failed", { ok: false, reason: "request-failed", detail: "timeout" }],
  ])("does not cancel when %s", async (_name, answer) => {
    const unpaid = await unpaidOrder(hoursAgo(25));
    await getPrisma().ruleMark.create({ data: { ruleKey: "unpaid-reminder", subjectId: unpaid.id, createdAt: hoursAgo(24) } });
    queryPaymentStatus.mockResolvedValue(answer);

    await pass();

    expect((await order(unpaid.id)).status).toBe("pending");
  });

  it("cancels after a failed attempt nobody retried", async () => {
    const unpaid = await unpaidOrder(hoursAgo(25));
    await getPrisma().ruleMark.create({ data: { ruleKey: "unpaid-reminder", subjectId: unpaid.id, createdAt: hoursAgo(24) } });
    queryPaymentStatus.mockResolvedValue({ ok: true, found: true, records: [{ status: "FAILED", paymentReference: null, orderReference: null, collectedAmount: null, message: "Insufficient funds", updatedAt: null }] });

    await pass();

    expect((await order(unpaid.id)).status).toBe("cancelled");
  });

  it("on the first pass after go-live, warns about old unpaid orders instead of cancelling them", async () => {
    const old = await unpaidOrder(hoursAgo(72));

    await pass(NOW);

    expect((await order(old.id)).status).toBe("pending");
    expect(sendCustomerEmail).toHaveBeenCalledTimes(1);
    expect(String(sendCustomerEmail.mock.calls[0][2])).toContain(`within the next ${UNPAID.minHoursAfterReminder} hours`);

    await pass(hoursFromNow(UNPAID.minHoursAfterReminder - 1));
    expect((await order(old.id)).status).toBe("pending");
    await pass(hoursFromNow(UNPAID.minHoursAfterReminder + 0.25));
    expect((await order(old.id)).status).toBe("cancelled");
  });

  it("with the reminder switched off, nothing is cancelled that was not warned", async () => {
    const unpaid = await unpaidOrder(hoursAgo(48));
    await setRuleOff("unpaid-reminder", true, "admin-1");

    await pass(NOW);
    await pass(hoursFromNow(24));

    expect((await order(unpaid.id)).status).toBe("pending");
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("re-checks a fresh pay link with ClickPesa, and records a payment the site was never told about", async () => {
    const unpaid = await unpaidOrder(hoursAgo(0.75));
    queryPaymentStatus.mockResolvedValue({
      ok: true,
      found: true,
      records: [{ status: "SUCCESS", paymentReference: "CPMISSED", orderReference: null, collectedAmount: ORDER_TZS, message: null, updatedAt: null, payerPhone: PAYER }],
    });

    const run = await pass();

    expect((await order(unpaid.id)).status).toBe("confirmed");
    expect(run.summary).toContain("had not been told about");
  });
});

// ---------------------------------------------------------------------------
describe("a paid order the shop does not deliver", () => {
  const day = 24;

  it("the shop is reminded once, a day after payment", async () => {
    await shopUser();
    const paid = await paidOrder(hoursAgo(UNDELIVERED.remindPartnerAfterHours + 1));
    forgetMessages();

    await pass(NOW);
    await pass(new Date(NOW.getTime() + PASS_MS));

    expect(sendPartnerEmail).toHaveBeenCalledTimes(1);
    expect(subjects(sendPartnerEmail)[0]).toContain(`paid order ${paid.reference} is still not delivered`);
    expect((await order(paid.id)).status).toBe("confirmed");
    expect(await alerts()).toEqual([]);
  });

  it("the owner is told on day three -- once, and not by text", async () => {
    const paid = await paidOrder(hoursAgo(UNDELIVERED.alertOwnerAfterHours + 1));
    forgetMessages();

    await pass(NOW);
    await pass(new Date(NOW.getTime() + PASS_MS));

    const raised = await alerts();
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ key: "delivery-late", urgency: "routine", href: `/admin/orders/${paid.id}` });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("the whole story: reminder, alert, last warning, cancellation, refund", async () => {
    await shopUser();
    const paidAt = hoursAgo(1);
    const paid = await paidOrder(paidAt);
    forgetMessages();
    const at = (hours: number) => new Date(paidAt.getTime() + hours * HOUR_MS);

    await pass(at(1 * day + 0.5), SENDING);
    expect(subjects(sendPartnerEmail)).toEqual([expect.stringContaining("is still not delivered")]);

    await pass(at(3 * day + 0.5), SENDING);
    expect((await alerts()).map((a) => a.key)).toEqual(["delivery-late"]);

    await pass(at(4 * day + 0.5), SENDING);
    expect(subjects(sendPartnerEmail)[1]).toContain(`order ${paid.reference} will be cancelled in`);
    expect(String(sendPartnerEmail.mock.calls[1][2])).toContain("report the problem on your orders page NOW");
    expect((await order(paid.id)).status).toBe("confirmed");

    // One pass before the deadline: still alive, no money moved.
    await pass(at(5 * day - 0.25), SENDING);
    expect((await order(paid.id)).status).toBe("confirmed");
    expect(createMobilePayout).not.toHaveBeenCalled();

    forgetMessages();
    const final = await pass(at(5 * day + 0.6), SENDING);

    expect(await order(paid.id)).toMatchObject({ status: "cancelled", decidedBy: RULES_ACTOR });
    // Cancelled and refunded in the same pass, to the wallet that paid.
    expect(createMobilePayout).toHaveBeenCalledTimes(1);
    expect(createMobilePayout.mock.calls[0][0]).toMatchObject({ amountTZS: ORDER_TZS, phoneNumber: PAYER });
    expect(await getPrisma().refundSend.findMany()).toMatchObject([{ status: "sent", reason: "deadline", amountTZS: ORDER_TZS }]);
    expect(final.summary).toContain(`Cancelled ${paid.reference}`);
    expect(final.summary).toContain(`Refunded TSh 50,000 for ${paid.reference}`);
    // Everyone hears: the customer twice (cancelled, refunded), the shop once (do not deliver).
    expect(subjects(sendCustomerEmail)).toEqual([expect.stringContaining("has been cancelled"), expect.stringContaining("Refund sent")]);
    expect(subjects(sendPartnerEmail)).toEqual([expect.stringContaining("do not deliver it")]);
    // The owner is told the refund is automatic, not asked to send it.
    expect(ownerSubjects().some((s) => s.includes("the refund is automatic"))).toBe(true);
    expect(ownerSubjects().some((s) => s.includes("refund due"))).toBe(false);
    // And the late-delivery alert is finished business.
    expect((await alerts()).filter((a) => a.status !== "resolved")).toEqual([]);

    // Nothing more happens on later passes.
    forgetMessages();
    await pass(at(5 * day + 1), SENDING);
    await pass(at(6 * day), SENDING);
    expect(createMobilePayout).toHaveBeenCalledTimes(1);
    expect(sendCustomerEmail).not.toHaveBeenCalled();
  });

  it("with money sending off, the order is still cancelled and the refund waits for the owner", async () => {
    const paid = await paidOrder(hoursAgo(UNDELIVERED.finalWarningAfterHours + 1));
    await pass(NOW, SITE);
    forgetMessages();

    await pass(hoursFromNow(UNDELIVERED.minHoursAfterFinalWarning + 1), SITE);

    expect((await order(paid.id)).status).toBe("cancelled");
    expect(createMobilePayout).not.toHaveBeenCalled();
    expect(ownerSubjects().some((s) => s.includes("refund due"))).toBe(true);
  });

  it("on the first pass after go-live, warns about a long-overdue order instead of cancelling it", async () => {
    const ancient = await paidOrder(hoursAgo(10 * day));

    await pass(NOW, SENDING);

    expect((await order(ancient.id)).status).toBe("confirmed");
    expect(createMobilePayout).not.toHaveBeenCalled();
    await pass(hoursFromNow(UNDELIVERED.minHoursAfterFinalWarning - 1), SENDING);
    expect((await order(ancient.id)).status).toBe("confirmed");
    await pass(hoursFromNow(UNDELIVERED.minHoursAfterFinalWarning + 0.25), SENDING);
    expect((await order(ancient.id)).status).toBe("cancelled");
  });

  it("is never cancelled once the owner says he is handling it", async () => {
    const paid = await paidOrder(hoursAgo(UNDELIVERED.alertOwnerAfterHours + 1));
    await pass(NOW, SENDING);
    const [alert] = await alerts();
    expect(await markAlertHandling(alert.id)).toBe(true);

    for (const hours of [24, 48, 96, 240]) await pass(hoursFromNow(hours), SENDING);

    expect((await order(paid.id)).status).toBe("confirmed");
    expect(createMobilePayout).not.toHaveBeenCalled();
    // The shop is not given a deadline the owner has taken away.
    expect(subjects(sendPartnerEmail).some((s) => s.includes("will be cancelled"))).toBe(false);
  });

  it("is never cancelled once the shop has reported a problem with the delivery", async () => {
    const { uid } = await shopUser();
    const paid = await paidOrder(hoursAgo(UNDELIVERED.finalWarningAfterHours + 1));
    await pass(NOW, SENDING);
    const reported = await reportDeliveryProblem(paid.id, { branchId: SHOP, agentId: null }, uid, "Delivered on Tuesday but the customer will not answer the phone to give the code");
    expect(reported).toEqual({ ok: true });

    await pass(hoursFromNow(UNDELIVERED.minHoursAfterFinalWarning + 1), SENDING);
    await pass(hoursFromNow(240), SENDING);

    expect((await order(paid.id)).status).toBe("confirmed");
    expect(createMobilePayout).not.toHaveBeenCalled();
  });

  it("is not cancelled while the courier's phone shows it on the road", async () => {
    const paid = await paidOrder(hoursAgo(UNDELIVERED.finalWarningAfterHours + 1));
    await pass(NOW, SENDING);
    const due = hoursFromNow(UNDELIVERED.minHoursAfterFinalWarning + 1);
    await getPrisma().deliveryPing.create({ data: { orderId: paid.id, latitude: -6.8, longitude: 39.28, createdAt: new Date(due.getTime() - HOUR_MS) } });

    await pass(due, SENDING);
    expect((await order(paid.id)).status).toBe("confirmed");

    // A day with no sign of it moving: the deadline applies again.
    await pass(new Date(due.getTime() + 25 * HOUR_MS), SENDING);
    expect((await order(paid.id)).status).toBe("cancelled");
  });

  it("closes the owner's alert by itself when the order is settled some other way", async () => {
    const { uid } = await shopUser();
    const paid = await paidOrder(hoursAgo(UNDELIVERED.alertOwnerAfterHours + 1));
    await pass(NOW);
    expect((await alerts()).map((a) => a.status)).toEqual(["open"]);

    await declineOrder(paid.id, uid, "Out of stock after all");
    await pass(new Date(NOW.getTime() + PASS_MS));

    expect((await alerts()).filter((a) => a.key === "delivery-late").map((a) => a.status)).toEqual(["resolved"]);
  });
});

// ---------------------------------------------------------------------------
describe("money", () => {
  it("refunds a shop's decline of a paid order on the next pass, with nobody pressing anything", async () => {
    const { uid } = await shopUser();
    const paid = await paidOrder(hoursAgo(2));
    await declineOrder(paid.id, uid, "Out of stock");
    forgetMessages();

    const run = await pass(NOW, SENDING);

    expect(run.summary).toContain(`Refunded TSh 50,000 for ${paid.reference}`);
    expect(subjects(sendCustomerEmail)).toEqual([expect.stringContaining("Refund sent")]);
  });

  it("sends nothing while the rulebook is paused, but still finds out what became of money already sent", async () => {
    const { uid } = await shopUser();
    const first = await paidOrder(hoursAgo(3));
    await declineOrder(first.id, uid, "Out of stock");
    createMobilePayout.mockResolvedValueOnce({ ok: false, reason: "unknown" });
    await pass(NOW, SENDING);
    expect((await getPrisma().refundSend.findMany()).map((r) => r.status)).toEqual(["sending"]);

    await setRulebookPaused(true, "admin-1");
    const second = await paidOrder(hoursAgo(2));
    await declineOrder(second.id, uid, "Out of stock");
    const [inFlight] = await getPrisma().refundSend.findMany();
    queryPayoutStatus.mockResolvedValue({ ok: true, found: true, record: { status: "SUCCESS", id: "CPDONE", orderReference: inFlight.sendRef, feeTZS: 900 } });

    const run = await pass(new Date(NOW.getTime() + PASS_MS), SENDING);

    expect(noteOf(run, "refund-send")?.skipped).toBe("paused");
    expect(noteOf(run, "money-in-flight")?.notes).toEqual(["A refund arrived; the customer has been told."]);
    expect(createMobilePayout).toHaveBeenCalledTimes(1);
    expect((await getPrisma().refundSend.findMany()).map((r) => r.status)).toEqual(["sent"]);
  });

  it("sends one thing a pass: the refund first, the shop's payout on the next", async () => {
    const { uid } = await shopUser();
    await getPrisma().branch.update({ where: { id: SHOP }, data: { phone: "0754 000 111" } });
    const declined = await paidOrder(hoursAgo(2));
    await declineOrder(declined.id, uid, "Out of stock");
    const delivered = await paidOrder(hoursAgo(3));
    await getPrisma().ledgerEntry.create({ data: { orderId: delivered.id, kind: "branch_payout", amountTZS: 47_000 } });

    const first = await pass(NOW, SENDING);
    expect(createMobilePayout).toHaveBeenCalledTimes(1);
    expect(first.summary).toContain("Refunded");
    expect(first.summary).not.toContain("Paid ");

    const second = await pass(new Date(NOW.getTime() + PASS_MS), SENDING);
    expect(createMobilePayout).toHaveBeenCalledTimes(2);
    expect(second.summary).toContain("Paid ");
  });

  it("pauses money and tells the owner when ClickPesa holds less than is owed", async () => {
    const delivered = await paidOrder(hoursAgo(3));
    await getPrisma().ledgerEntry.create({ data: { orderId: delivered.id, kind: "branch_payout", amountTZS: 47_000 } });
    getAccountBalance.mockResolvedValue({ ok: true, balanceTZS: 46_999 });
    // The payout itself is refused for the same reason, so the money stays owed.
    previewMobilePayout.mockResolvedValue({ ok: true, feeTZS: 1_000, totalTZS: 48_000, balanceTZS: 46_999, receiverName: "TOYOTA DAR", provider: "MPESA" });

    const run = await pass(NOW, SENDING);

    expect(noteOf(run, "books-check")).toMatchObject({ acted: 1 });
    const raised = (await alerts()).filter((a) => a.key === "books-short");
    expect(raised).toHaveLength(1);
    expect(raised[0].urgency).toBe("urgent");
    expect((await getPrisma().appSetting.findUnique({ where: { key: "autoPayoutsPaused" } }))?.value).toBe("true");
    // Once a day, not once a pass.
    getAccountBalance.mockClear();
    await pass(new Date(NOW.getTime() + PASS_MS), SENDING);
    expect(getAccountBalance).not.toHaveBeenCalled();
  });

  it("says nothing when ClickPesa holds exactly what is owed", async () => {
    const delivered = await paidOrder(hoursAgo(3));
    await getPrisma().ledgerEntry.create({ data: { orderId: delivered.id, kind: "branch_payout", amountTZS: 47_000 } });
    getAccountBalance.mockResolvedValue({ ok: true, balanceTZS: 47_000 });
    // Enough to cover what is owed, though not this payout's fee on top.
    previewMobilePayout.mockResolvedValue({ ok: true, feeTZS: 1_000, totalTZS: 48_000, balanceTZS: 47_000, receiverName: "TOYOTA DAR", provider: "MPESA" });

    await pass(NOW, SENDING);

    expect((await alerts()).filter((a) => a.key === "books-short")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("a shop whose documents have not been checked", () => {
  const DAY_MS = 24 * HOUR_MS;
  const liveProducts = () => getPrisma().product.count({ where: { branchId: SHOP, hiddenAt: null } });
  const verificationAlerts = async () => (await alerts()).filter((a) => a.key === "shop-verification");
  async function upload(applicationId: string, uid: string, kinds: string[]) {
    for (const kind of kinds) {
      await getPrisma().partnerDocument.create({
        data: { applicationId, uid, kind, storagePath: `${uid}/${applicationId}/${kind}-${Date.now()}-${Math.random()}.pdf`, mimeType: "application/pdf", byteSize: 1000 },
      });
    }
  }

  it("is asked once, in both languages, with a date; the owner is told; nothing is hidden yet", async () => {
    const { email } = await shopUser(SHOP, { verified: false });
    const before = await liveProducts();

    const run = await pass();

    expect(noteOf(run, "shop-verification")?.acted).toBe(1);
    const [alert] = await verificationAlerts();
    expect(alert).toMatchObject({ urgency: "routine", status: "open" });
    expect(alert.body).toContain("19 September 2026");
    const asked = sendPartnerEmail.mock.calls.filter((call) => call[0] === email);
    expect(asked).toHaveLength(1);
    expect(String(asked[0][2])).toMatch(/Leseni ya biashara/);
    expect(String(asked[0][2])).toMatch(/Business licence/);
    expect(String(asked[0][2])).toContain("19 September 2026");
    expect(await liveProducts()).toBe(before);

    // Later passes inside the fortnight do nothing more.
    forgetMessages();
    await pass(new Date(NOW.getTime() + (SHOP_VERIFICATION.graceDays - 1) * DAY_MS));
    expect(sendPartnerEmail).not.toHaveBeenCalled();
    expect(await verificationAlerts()).toHaveLength(1);
    expect(await liveProducts()).toBe(before);
  });

  it("has its products hidden once the fortnight passes without them, and verifying puts back exactly those", async () => {
    const { email, partnerId, applicationId, uid } = await shopUser(SHOP, { verified: false });
    const before = await liveProducts();
    expect(before).toBeGreaterThan(1);
    const otherShops = await getPrisma().product.count({ where: { branchId: { not: SHOP }, hiddenAt: null } });
    await pass();
    forgetMessages();

    const late = new Date(NOW.getTime() + SHOP_VERIFICATION.graceDays * DAY_MS + PASS_MS);
    const run = await pass(late);

    expect(noteOf(run, "shop-verification")?.acted).toBe(1);
    expect(await liveProducts()).toBe(0);
    expect(await getPrisma().product.count({ where: { branchId: { not: SHOP }, hiddenAt: null } })).toBe(otherShops);
    expect(sendPartnerEmail.mock.calls.some((call) => call[0] === email && /hidden until your documents are checked/.test(String(call[1])))).toBe(true);
    const [alert] = await verificationAlerts();
    expect(alert.body).toMatch(/were hidden/);

    // Hidden once, not every pass.
    forgetMessages();
    await pass(new Date(late.getTime() + PASS_MS));
    expect(sendPartnerEmail).not.toHaveBeenCalled();

    // An admin hides one product for another reason in the meantime.
    const [other] = await getPrisma().product.findMany({ where: { branchId: SHOP }, take: 1 });
    await getPrisma().product.update({ where: { id: other.id }, data: { hiddenAt: new Date(late.getTime() + 2 * PASS_MS) } });

    // Not verifiable without all three.
    await upload(applicationId, uid, ["licence", "tin"]);
    expect(await markShopVerified(partnerId, "admin-1")).toEqual({ ok: false, reason: "documents-missing" });

    await upload(applicationId, uid, ["shopfront"]);
    expect(await markShopVerified(partnerId, "admin-1")).toEqual({ ok: true, restored: before - 1 });
    expect(await liveProducts()).toBe(before - 1);
    expect((await getPrisma().product.findUniqueOrThrow({ where: { id: other.id } })).hiddenAt).not.toBeNull();
    expect((await verificationAlerts()).map((a) => a.status)).toEqual(["resolved"]);

    // Verified: the rule leaves it alone from now on.
    forgetMessages();
    await pass(new Date(late.getTime() + 3 * PASS_MS));
    expect(await verificationAlerts()).toHaveLength(1);
    expect(sendPartnerEmail).not.toHaveBeenCalled();
  });

  it("finishes putting products back on the next pass if that failed when the shop was verified", async () => {
    const { partnerId, applicationId, uid } = await shopUser(SHOP, { verified: false });
    const before = await liveProducts();
    await pass();
    const late = new Date(NOW.getTime() + SHOP_VERIFICATION.graceDays * DAY_MS + PASS_MS);
    await pass(late);
    expect(await liveProducts()).toBe(0);
    await upload(applicationId, uid, ["licence", "tin", "shopfront"]);

    // The products can't be written just as the owner presses the button.
    const spy = vi.spyOn(getPrisma().product, "updateMany").mockRejectedValueOnce(new Error("connection reset"));
    expect(await markShopVerified(partnerId, "admin-1")).toEqual({ ok: true, restored: 0, restoreFailed: true });
    spy.mockRestore();

    // Verified all the same, and the alert is still open for the rule to finish.
    expect((await getPrisma().partner.findUniqueOrThrow({ where: { id: partnerId } })).documentsVerifiedAt).not.toBeNull();
    expect((await verificationAlerts()).map((a) => a.status)).toEqual(["open"]);
    expect(await liveProducts()).toBe(0);

    const run = await pass(new Date(late.getTime() + PASS_MS));

    expect(await liveProducts()).toBe(before);
    expect((await verificationAlerts()).map((a) => a.status)).toEqual(["resolved"]);
    expect(noteOf(run, "shop-verification")?.notes.join(" ")).toMatch(/Finished verifying/);
  });

  it("is not hidden for MalFleks not having read documents it already sent", async () => {
    const { applicationId, uid } = await shopUser(SHOP, { verified: false });
    const before = await liveProducts();
    await pass();
    await upload(applicationId, uid, ["licence", "tin", "shopfront"]);

    await pass(new Date(NOW.getTime() + (SHOP_VERIFICATION.graceDays + 3) * DAY_MS));

    expect(await liveProducts()).toBe(before);
    expect((await verificationAlerts()).map((a) => a.status)).toEqual(["open"]);
  });

  it("can be switched off, and leaves a verified shop alone", async () => {
    await shopUser(SHOP);
    await pass();
    expect(await verificationAlerts()).toEqual([]);

    await shopUser("toyota-arusha", { verified: false });
    await setRuleOff("shop-verification", true, "admin-1");
    await pass(new Date(NOW.getTime() + PASS_MS));
    expect(await verificationAlerts()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("a shop that keeps failing paid orders", () => {
  async function failPaidOrders(count: number, uid: string) {
    for (let i = 0; i < count; i += 1) {
      const paid = await paidOrder(hoursAgo(10 + i));
      await declineOrder(paid.id, uid, "Out of stock");
    }
  }
  const liveProducts = () => getPrisma().product.count({ where: { branchId: SHOP, hiddenAt: null } });

  it("is left on the shop one failure short of the line", async () => {
    const { uid } = await shopUser();
    const before = await liveProducts();
    await failPaidOrders(SHOP_RELIABILITY.failures - 1, uid);

    await pass();

    expect(await liveProducts()).toBe(before);
    expect((await alerts()).filter((a) => a.key === "shop-reliability")).toEqual([]);
  });

  it("has its products hidden at the line; the shop and the owner are told; one button puts them back", async () => {
    const { uid, email } = await shopUser();
    const before = await liveProducts();
    expect(before).toBeGreaterThan(0);
    const otherShops = await getPrisma().product.count({ where: { branchId: { not: SHOP }, hiddenAt: null } });
    await failPaidOrders(SHOP_RELIABILITY.failures, uid);
    forgetMessages();

    const run = await pass();

    expect(await liveProducts()).toBe(0);
    // Nobody else's products are touched.
    expect(await getPrisma().product.count({ where: { branchId: { not: SHOP }, hiddenAt: null } })).toBe(otherShops);
    expect(notifyPublicSiteOfCatalogueChange).toHaveBeenCalledTimes(1);
    expect(noteOf(run, "shop-reliability")?.acted).toBe(1);
    const [alert] = (await alerts()).filter((a) => a.key === "shop-reliability");
    expect(alert).toMatchObject({ urgency: "urgent", status: "open" });
    expect(sendPartnerEmail.mock.calls.some((call) => call[0] === email && String(call[1]).includes("taken off the shop"))).toBe(true);

    // The next pass does not do it again.
    forgetMessages();
    await pass(new Date(NOW.getTime() + PASS_MS));
    expect((await alerts()).filter((a) => a.key === "shop-reliability")).toHaveLength(1);
    expect(sendPartnerEmail).not.toHaveBeenCalled();

    // The owner speaks to the shop and puts them back.
    expect(await restoreHiddenListings(alert.id)).toBe(before);
    await resolveAlert(alert.id, "admin-1");
    expect(await liveProducts()).toBe(before);

    // The same three failures do not hide the shop again.
    await pass(new Date(NOW.getTime() + 2 * PASS_MS));
    expect(await liveProducts()).toBe(before);
  });

  it("does not put back a product an admin had hidden for another reason", async () => {
    const { uid } = await shopUser();
    // Not the product the fixtures order.
    const [already] = await getPrisma().product.findMany({ where: { branchId: SHOP, id: { not: "toyota-corolla" } }, take: 1 });
    await getPrisma().product.update({ where: { id: already.id }, data: { hiddenAt: hoursAgo(100) } });
    await failPaidOrders(SHOP_RELIABILITY.failures, uid);
    await pass();
    const [alert] = (await alerts()).filter((a) => a.key === "shop-reliability");

    await restoreHiddenListings(alert.id);

    expect((await getPrisma().product.findUniqueOrThrow({ where: { id: already.id } })).hiddenAt).not.toBeNull();
  });

  it("does not count a shop declining orders nobody had paid for", async () => {
    const { uid } = await shopUser();
    const before = await liveProducts();
    for (let i = 0; i < SHOP_RELIABILITY.failures + 2; i += 1) {
      const unpaid = await unpaidOrder(hoursAgo(2));
      await declineOrder(unpaid.id, uid, "Out of stock");
    }

    await pass();

    expect(await liveProducts()).toBe(before);
  });
});

// ---------------------------------------------------------------------------
describe("keeping the owner informed", () => {
  it("sends one summary a morning, including on a day when nothing happened", async () => {
    await setRuleOff("daily-summary", false, "test");

    await pass(NOW);
    await pass(new Date(NOW.getTime() + PASS_MS));
    await pass(hoursFromNow(5));

    expect(ownerSubjects()).toEqual(["MalFleks daily: nothing needs you"]);
    const body = String(sendNotification.mock.calls[0][1]);
    expect(body).toContain("Fri 4 Sep");
    expect(body).toContain("Nothing is waiting for you.");

    await pass(hoursFromNow(24));
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("does not send the summary before eight in the morning in Dar es Salaam", async () => {
    await setRuleOff("daily-summary", false, "test");

    await pass(new Date("2026-09-05T04:45:00Z"));
    expect(sendNotification).not.toHaveBeenCalled();

    await pass(new Date("2026-09-05T05:00:00Z"));
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("lists what is waiting, and says when ClickPesa is down", async () => {
    await setRuleOff("daily-summary", false, "test");
    checkGateway.mockResolvedValue({ ok: false, detail: "HTTP 404" });
    await pass(new Date("2026-09-05T04:00:00Z"));
    await pass(new Date("2026-09-05T04:15:00Z"));
    forgetMessages();

    await pass(new Date("2026-09-05T05:00:00Z"));

    const [subject, body] = sendNotification.mock.calls[0];
    expect(subject).toBe("MalFleks daily: 1 thing waiting for you");
    expect(body).toContain("DOWN - customers cannot pay");
    expect(body).toContain("! ClickPesa is not answering");
  });

  it("the daily job notices that the 15-minute timer was never set up, and says so once", async () => {
    await pass(NOW, SITE, "daily");
    await pass(hoursFromNow(24), SITE, "daily");

    const raised = await alerts();
    expect(raised.map((a) => [a.key, a.urgency])).toEqual([["clock-not-set-up", "routine"]]);
  });

  it("the daily job notices a timer that has stopped; the timer's return clears the alarm", async () => {
    await pass(hoursAgo(5), SITE, "timer");

    await pass(NOW, SITE, "daily");
    const raised = await alerts();
    expect(raised.map((a) => [a.key, a.urgency, a.status])).toEqual([["clock-stopped", "urgent", "open"]]);
    expect(raised[0].body).toContain("5 hours ago");
    expect(sendSms).toHaveBeenCalledTimes(1);

    await pass(new Date(NOW.getTime() + PASS_MS), SITE, "timer");
    expect((await alerts()).map((a) => a.status)).toEqual(["resolved"]);
  });

  it("the daily job says nothing when the timer called a few minutes ago", async () => {
    await pass(new Date(NOW.getTime() - 10 * 60_000), SITE, "timer");

    await pass(NOW, SITE, "daily");

    expect(await alerts()).toEqual([]);
  });

  it("an alert the owner closed is raised again if the problem is still there", async () => {
    const paid = await paidOrder(hoursAgo(UNDELIVERED.alertOwnerAfterHours + 1));
    await pass(NOW);
    const [first] = await alerts();
    await resolveAlert(first.id, "admin-1");

    await pass(new Date(NOW.getTime() + PASS_MS));

    const all = await alerts();
    expect(all.map((a) => a.status)).toEqual(["resolved", "open"]);
    expect(all[1].href).toBe(`/admin/orders/${paid.id}`);
  });
});
