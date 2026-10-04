import { resolveSiteUrl } from "@/lib/site-url";
import { getPrisma } from "@/server/db/client";
import { findStuckOrders } from "@/server/orders/stuck";
import type { Agent, AgentShift, AgentResult } from "./types";

/**
 * The night watchman: the first resident of the city, and the one that proves
 * the city works.
 *
 * It uses **no language model at all**. Checking that a page answers, counting
 * rows, and comparing a number with yesterday's are HTTP requests and
 * arithmetic. That matters for three reasons: a shift costs nothing, it needs
 * no API key, and it cannot stop working because a bill went unpaid.
 *
 * It is strictly read-only on MalFleks's data. The only row it ever writes is
 * its own shift in the archive, and -- once -- a question at the help desk.
 */

/** The pages a visitor would notice first. Kept short: this is a heartbeat, not a crawl. */
const PAGES = ["/", "/search", "/brands", "/how-it-works"];

const PAGE_TIMEOUT_MS = 12_000;

/** Where the watchman looks. Its own deployment by default; `AGENT_SITE_URL` when the shop lives elsewhere. */
function siteUrl(): string {
  const configured = process.env.AGENT_SITE_URL?.trim();
  return configured ? configured.replace(/\/+$/, "") : resolveSiteUrl();
}

async function pageStatus(url: string): Promise<{ ok: boolean; status: number | null; ms: number }> {
  const started = Date.now();
  try {
    // GET, not HEAD: a prerendered page can answer HEAD from the edge while the
    // page itself is broken, which is the failure this check exists to catch.
    const response = await fetch(url, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS), cache: "no-store" });
    return { ok: response.ok, status: response.status, ms: Date.now() - started };
  } catch {
    return { ok: false, status: null, ms: Date.now() - started };
  }
}

const HOUR_MS = 60 * 60_000;

async function run(shift: AgentShift): Promise<AgentResult> {
  const db = getPrisma();
  const base = siteUrl();
  const problems: string[] = [];

  // --- Does the shop answer? -----------------------------------------------
  const pages = await Promise.all(PAGES.map(async (path) => ({ path, ...(await pageStatus(`${base}${path}`)) })));
  const down = pages.filter((page) => !page.ok);
  const slowest = pages.reduce((worst, page) => (page.ms > worst.ms ? page : worst), pages[0]);

  for (const page of down) {
    shift.note("problem", `${page.path} did not answer${page.status ? ` (${page.status})` : ""}.`);
  }
  if (down.length === 0) {
    shift.note("info", `All ${pages.length} pages answered; slowest was ${slowest.path} at ${(slowest.ms / 1000).toFixed(1)}s.`);
  }
  if (down.length > 0) problems.push(down.length === pages.length ? "the shop is down" : `${down.length} pages are down`);

  // --- What is waiting for a person? ---------------------------------------
  const since24h = new Date(shift.now.getTime() - 24 * HOUR_MS);
  const [pendingOrders, applications, submissions, unpaidLinks, errors24h, rejectedPhotos, stuck] = await Promise.all([
    db.order.count({ where: { status: "pending" } }),
    db.partnerApplication.count({ where: { status: "pending" } }),
    db.productSubmission.count({ where: { status: "pending" } }),
    db.orderPayment.count({ where: { status: "pending" } }),
    db.serverErrorLog.count({ where: { createdAt: { gte: since24h } } }),
    db.serverErrorLog.count({ where: { context: "ai-clean-photo", createdAt: { gte: since24h } } }),
    findStuckOrders(shift.now),
  ]);

  // An application nobody answers is the most expensive silence on the site:
  // nothing else tells the owner a shop applied, and an applicant who hears
  // nothing simply applies again, or does not.
  if (applications > 0) {
    shift.note("problem", `${applications} partner ${applications === 1 ? "application is" : "applications are"} waiting for an answer.`, "/admin/applications");
    problems.push(`${applications} ${applications === 1 ? "application" : "applications"} waiting`);
  }
  if (submissions > 0) {
    shift.note("watch", `${submissions} product ${submissions === 1 ? "submission" : "submissions"} waiting to be published.`, "/admin/submissions");
  }
  if (pendingOrders > 0) {
    shift.note("watch", `${pendingOrders} ${pendingOrders === 1 ? "order has" : "orders have"} not been confirmed yet.`, "/admin/orders");
  }

  const stuckTotal = stuck.undecided.length + stuck.unpaid.length + stuck.undelivered.length;
  if (stuckTotal > 0) {
    shift.note(
      "problem",
      `${stuckTotal} ${stuckTotal === 1 ? "order has" : "orders have"} stopped moving (${stuck.undecided.length} unconfirmed, ${stuck.unpaid.length} unpaid, ${stuck.undelivered.length} undelivered).`,
      "/admin/orders",
    );
    problems.push(`${stuckTotal} stuck`);
  }

  if (errors24h > 0) {
    const level = errors24h >= 20 ? "problem" : "watch";
    shift.note(level, `${errors24h} server ${errors24h === 1 ? "error" : "errors"} in the last day.`, "/admin");
    if (level === "problem") problems.push(`${errors24h} errors`);
  }
  // Today's new photo cleaner throws away any picture that changed the item.
  // A few are the check doing its job; a lot means the model is not usable.
  if (rejectedPhotos > 0) {
    shift.note("watch", `${rejectedPhotos} cleaned ${rejectedPhotos === 1 ? "photo was" : "photos were"} rejected or failed in the last day.`);
  }

  // --- What changed since the last shift? ----------------------------------
  const [orders, products, partners] = await Promise.all([
    db.order.count(),
    db.product.count(),
    db.partner.count({ where: { status: "active" } }),
  ]);

  const was = shift.previous;
  if (was && typeof was.orders === "number") {
    const newOrders = orders - was.orders;
    if (newOrders > 0) shift.note("info", `${newOrders} new ${newOrders === 1 ? "order" : "orders"} since the last shift.`);
    if (newOrders === 0) shift.note("info", "No new orders since the last shift.");
    if (newOrders < 0) shift.note("watch", `The order count went down by ${Math.abs(newOrders)}. Orders are never deleted, so this is worth a look.`);
  } else {
    shift.note("info", `First shift: ${orders} orders, ${products} products, ${partners} active partners.`);
  }

  // --- The one thing it asks about -----------------------------------------
  // A cancelled order still holding a customer's money is the promise failing
  // in the only direction that matters. The rule for refunding a change of
  // mind is the owner's to decide and has not been, so the watchman asks once
  // rather than every shift.
  const refundsDue = await db.order.count({ where: { status: "cancelled", payments: { some: { status: "captured" } } } });
  if (refundsDue > 0) {
    shift.note("problem", `${refundsDue} cancelled ${refundsDue === 1 ? "order still holds" : "orders still hold"} customer money.`, "/admin/payouts");
    problems.push(`${refundsDue} unrefunded`);
    await shift.ask(
      "refund-rule",
      "What is the refund rule when a customer changes their mind on a paid order: full refund, a fee kept, or case by case?",
      "Cancelled orders are holding captured payments, and nothing in the handbook says how much to send back.",
    );
  }

  const summary =
    problems.length > 0
      ? `Needs a look: ${problems.join(", ")}.`
      : `All quiet. ${orders} orders, ${products} products, ${partners} active partners.`;

  return {
    outcome: problems.length > 0 ? "attention" : "ok",
    summary,
    metrics: {
      pagesChecked: pages.length,
      pagesDown: down.length,
      slowestMs: slowest.ms,
      orders,
      pendingOrders,
      products,
      partners,
      applications,
      submissions,
      unpaidLinks,
      stuck: stuckTotal,
      errors24h,
      rejectedPhotos,
      refundsDue,
    },
  };
}

export const watchman: Agent = {
  key: "watchman",
  name: "The night watchman",
  office: "Operations",
  job: "Checks every day that the shop answers, that nothing is stuck, and that nobody is waiting for an answer.",
  reads: ["The public pages", "Orders, payments and applications (counts only)", "The error log"],
  writes: [],
  boundary: "Reports only. It cancels nothing, emails nobody and changes no order.",
  needsModel: false,
  curriculum: ["promise", "order-life", "money", "city"],
  // It only reports, so there is nothing to supervise: it starts able to work.
  defaultRank: "employed",
  run,
};
