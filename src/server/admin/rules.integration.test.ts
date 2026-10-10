// @vitest-environment node
//
// What the Rules page is told. The page decides nothing, so what matters here
// is that it cannot mislead: a stopped clock must not read as running, a
// refund that may have left must not be offered a retry, and the secret the
// timer uses must never be part of what is drawn.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { raiseAlert } from "@/server/rules/alerts";
import { RULEBOOK } from "@/server/rules/rulebook";
import { setRuleOff, setRulebookPaused } from "@/server/rules/settings";
import { CLOCK_STOPPED_AFTER_MINUTES } from "@/server/rules/thresholds";
import { readRulesPage } from "./rules";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("rules_page");
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

const NOW = new Date("2026-10-10T10:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const CRON_SECRET = "a-secret-that-must-never-be-drawn";
/** No email or text provider: alerts are recorded and nothing is sent. */
const ENV = { MALFLEKS_ADMIN_HOST: "admin.example", CRON_SECRET };

async function timerPassAt(startedAt: Date, results: unknown[] = []) {
  await getPrisma().ruleRun.create({ data: { trigger: "timer", startedAt, finishedAt: startedAt, summary: "Nothing needed doing.", results: results as never } });
}

beforeEach(async () => {
  const prisma = getPrisma();
  await prisma.ruleRun.deleteMany({});
  await prisma.ownerAlert.deleteMany({});
  await prisma.appSetting.deleteMany({});
  await prisma.refundSend.deleteMany({});
  await prisma.order.deleteMany({});
});

describe("a site where the rulebook has never run", () => {
  it("says the clock is not set up, ClickPesa is not known, and nothing is waiting", async () => {
    const page = await readRulesPage(NOW, ENV);

    expect(page.clock).toMatchObject({ state: "never", lastTimerAt: null, lastRunAt: null, timerPassesToday: 0, apiCallsToday: 0 });
    expect(page.gateway).toEqual({ state: null, down: false });
    expect(page.paused).toBe(false);
    expect(page.alerts).toEqual([]);
    expect(page.activity).toEqual([]);
  });

  it("lists every rule exactly once, each with words for the owner, none of them run yet", async () => {
    const page = await readRulesPage(NOW, ENV);
    const listed = page.groups.flatMap((g) => g.rules);

    expect(listed.map((r) => r.key).sort()).toEqual(RULEBOOK.map((r) => r.key).sort());
    expect(listed.every((r) => r.last === null && !r.off)).toBe(true);
    expect(listed.filter((r) => r.movesMoney).map((r) => r.key).sort()).toEqual(["payout-send", "refund-send"]);
  });

  it("reports money sending as off unless the deployment switched it on", async () => {
    expect((await readRulesPage(NOW, ENV)).money).toMatchObject({ armed: false, active: false });
    expect((await readRulesPage(NOW, { ...ENV, AUTO_PAYOUTS: "on" })).money).toMatchObject({ armed: true, active: true });
  });
});

describe("the timer", () => {
  it("gives the address to call and whether the secret is set -- never the secret", async () => {
    const page = await readRulesPage(NOW, ENV);

    expect(page.timerUrl).toBe("https://admin.example/api/rules/run");
    expect(page.cronSecretSet).toBe(true);
    expect(JSON.stringify(page)).not.toContain(CRON_SECRET);
    expect((await readRulesPage(NOW, { ...ENV, CRON_SECRET: "  " })).cronSecretSet).toBe(false);
  });

  it("reads as running right up to the limit, and stopped one minute past it", async () => {
    await timerPassAt(minutesAgo(CLOCK_STOPPED_AFTER_MINUTES));
    expect((await readRulesPage(NOW, ENV)).clock.state).toBe("running");

    await getPrisma().ruleRun.deleteMany({});
    await timerPassAt(minutesAgo(CLOCK_STOPPED_AFTER_MINUTES + 1));
    expect((await readRulesPage(NOW, ENV)).clock.state).toBe("stopped");
  });

  it("is not fooled by the daily job or a manual run into thinking the timer is alive", async () => {
    await getPrisma().ruleRun.create({ data: { trigger: "daily", startedAt: minutesAgo(5), finishedAt: minutesAgo(5), summary: "", results: [] } });
    await getPrisma().ruleRun.create({ data: { trigger: "manual", startedAt: minutesAgo(2), finishedAt: minutesAgo(2), summary: "", results: [] } });

    const page = await readRulesPage(NOW, ENV);

    expect(page.clock.state).toBe("never");
    expect(page.clock.lastRunAt).toEqual(minutesAgo(2));
  });
});

describe("what each rule did last", () => {
  it("shows the latest pass's outcome beside its rule, and the owner's switches", async () => {
    await timerPassAt(minutesAgo(20), [{ key: "unpaid-reminder", acted: 1, notes: ["An older pass."] }]);
    await timerPassAt(minutesAgo(5), [
      { key: "unpaid-reminder", acted: 0, notes: [] },
      { key: "refund-send", acted: 0, notes: [], error: "boom" },
    ]);
    await setRuleOff("shop-reliability", true, "admin-1");
    await setRulebookPaused(true, "admin-1");

    const page = await readRulesPage(NOW, ENV);
    const rule = (key: string) => page.groups.flatMap((g) => g.rules).find((r) => r.key === key);

    expect(page.paused).toBe(true);
    expect(rule("unpaid-reminder")?.last).toEqual({ key: "unpaid-reminder", acted: 0, notes: [] });
    expect(rule("refund-send")?.last?.error).toBe("boom");
    expect(rule("shop-reliability")?.off).toBe(true);
    expect(rule("gateway-watch")?.last).toBeNull();
  });

  it("survives a recorded pass whose results are not in the shape it expects", async () => {
    await timerPassAt(minutesAgo(5), ["nonsense", null, { acted: 1 }] as unknown[]);

    const page = await readRulesPage(NOW, ENV);

    expect(page.groups.flatMap((g) => g.rules).every((r) => r.last === null)).toBe(true);
  });
});

describe("what is waiting on the owner", () => {
  it("puts urgent alerts first, and says texts are not set up when they are not", async () => {
    await raiseAlert({ key: "delivery-late", subjectId: "o1", urgency: "routine", subject: "Routine thing", body: "b" }, ENV);
    await raiseAlert({ key: "gateway-down", urgency: "urgent", subject: "Urgent thing", body: "b" }, ENV);

    const page = await readRulesPage(NOW, ENV);

    expect(page.alerts.map((a) => a.subject)).toEqual(["Urgent thing", "Routine thing"]);
    expect(page.texting).toBe("no-provider");
    const withProvider = { ...ENV, BEEM_API_KEY: "k", BEEM_SECRET_KEY: "s", SMS_SENDER_ID: "MalFleks" };
    expect((await readRulesPage(NOW, withProvider)).texting).toBe("no-number");
    expect((await readRulesPage(NOW, { ...withProvider, MALFLEKS_OWNER_PHONE: "not a number" })).texting).toBe("no-number");
  });

  it("offers a refund retry only where the refund never left MalFleks", async () => {
    const prisma = getPrisma();
    const make = async (reference: string) =>
      prisma.order.create({
        data: {
          status: "cancelled",
          productName: "Thing",
          unitPriceTZS: 1,
          brandName: "B",
          brandSlug: "b",
          branchName: "Branch",
          branchCity: "Dar",
          routeKind: "brand",
          routeCarrier: "B",
          customerFullName: "Asha",
          customerPhone: "0754123456",
          customerAddress: "A",
          quantity: 1,
          lineTotalTZS: 1,
          reference,
          requestedAt: NOW,
        },
        select: { id: true },
      });
    const neverLeft = await make("REF-NEVER-LEFT");
    const mayHaveLeft = await make("REF-MAY-HAVE-LEFT");
    await prisma.refundSend.create({ data: { orderId: neverLeft.id, amountTZS: 5_000, reason: "deadline", status: "failed" } });
    await prisma.refundSend.create({ data: { orderId: mayHaveLeft.id, amountTZS: 5_000, reason: "deadline", status: "failed", sendRef: "RX1", sendStartedAt: minutesAgo(30) } });
    for (const order of [neverLeft, mayHaveLeft]) {
      await raiseAlert({ key: "refund-needs-owner", subjectId: order.id, urgency: "urgent", subject: `Refund ${order.id}`, body: "b", href: `/admin/orders/${order.id}` }, ENV);
    }

    const page = await readRulesPage(NOW, ENV);
    const retry = (orderId: string) => page.alerts.find((a) => a.href === `/admin/orders/${orderId}`)?.refundRetryOrderId;

    expect(retry(neverLeft.id)).toBe(neverLeft.id);
    expect(retry(mayHaveLeft.id)).toBeNull();
  });
});
