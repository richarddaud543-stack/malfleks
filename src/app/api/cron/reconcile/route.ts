import { logServerError } from "@/server/error-log";
import { runStuckOrderSafetyNet } from "@/server/orders/stuck";
import { reconcileDue } from "@/server/payments/reconcile";

export const dynamic = "force-dynamic";

/**
 * The daily payment check, called by Vercel Cron (see `vercel.json`).
 *
 * ## Who may call it
 *
 * Only Vercel, proven by `Authorization: Bearer $CRON_SECRET` -- Vercel sends
 * that header itself when the variable is set. With no `CRON_SECRET` this
 * answers 401 to everyone, including Vercel: fail closed.
 *
 * That is also how the two projects are kept from both running it.
 * `vercel.json` is shared, so Vercel schedules this on the shop *and* the
 * admin project. `CRON_SECRET` is set only on `malfleks-admin`, so the shop's
 * call is refused and only the admin project -- whose ClickPesa key is the
 * one proven to work -- actually checks anything.
 *
 * It deliberately does not use the admin hostname lock (`adminRoutesAvailable`).
 * Vercel calls the project's production domain, which is not necessarily the
 * hostname `MALFLEKS_ADMIN_HOST` names; the secret is the gate here.
 *
 * ## The side effect worth having
 *
 * The run reads the database even on a day with nothing to check. Supabase's
 * free plan pauses a project after a week without activity, and a quiet
 * prerendered shop generates almost none -- which is how production was found
 * paused on 1 Oct 2026, while the cached catalogue kept looking healthy. A
 * daily read is enough to keep it awake.
 *
 * ## The second job: orders that have stopped moving
 *
 * After the payment check, the same run sends MalFleks's inbox one digest of
 * stuck orders and reminds each branch once about an order it has not
 * answered in a day -- see `src/server/orders/stuck.ts`. It rides on this
 * cron because the Hobby plan allows daily jobs only and one daily run is
 * enough for both. It is independent of ClickPesa (it runs whether or not the
 * credentials are set, and whether or not the payment check succeeded), it
 * cancels nothing, and it cannot fail this route: a payment check that worked
 * still answers 200 if the digest did not send.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const ready = Boolean(process.env.CLICKPESA_CLIENT_ID?.trim() && process.env.CLICKPESA_API_KEY?.trim());

  // Every open payment that wasn't checked in the last 6 hours, up to 20 --
  // a fifth of the day's API budget, the rest left for checkout links.
  let results: Awaited<ReturnType<typeof reconcileDue>> = [];
  let reconcileFailed = false;
  try {
    results = ready ? await reconcileDue({ staleAfterMinutes: 360, limit: 20 }) : [];
  } catch (error) {
    await logServerError("clickpesa-reconcile-cron", error);
    reconcileFailed = true;
  }

  // Runs whether or not the payment check worked -- a ClickPesa outage is no
  // reason to skip telling anyone what is stuck. Never throws: each half logs
  // its own failure and reports `null`.
  const stuck = await runStuckOrderSafetyNet();

  if (reconcileFailed) {
    return Response.json({ ok: false, stuckOrders: stuck.digest, branchReminders: stuck.branchReminders }, { status: 500 });
  }
  return Response.json({
    ok: true,
    checked: results.length,
    captured: results.filter((r) => r.outcome === "captured").length,
    results: results.map((r) => ({ ref: r.providerRef, outcome: r.outcome, clickpesa: r.providerStatus })),
    stuckOrders: stuck.digest,
    branchReminders: stuck.branchReminders,
    ...(ready ? {} : { skipped: "ClickPesa credentials not set on this deployment" }),
  });
}
