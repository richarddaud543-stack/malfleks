import { after } from "next/server";

import { runRulebook } from "@/server/rules/engine";

export const dynamic = "force-dynamic";

// A pass stops starting new work after 45 seconds (see `PASS_BUDGET_MS` in
// src/server/rules/engine.ts); this leaves it room to finish what it began.
export const maxDuration = 60;

/**
 * The door the fifteen-minute timer knocks on: `GET /api/rules/run`.
 *
 * ## Why an outside timer
 *
 * The hosting plan runs a scheduled job once a day and no finer. The owner
 * chose (10 Oct 2026) to stay on that plan and have a free outside timer call
 * the site every fifteen minutes instead. This is the address it calls. The
 * once-a-day job (`/api/cron/reconcile`) runs the same rulebook as a backstop
 * and is also what notices if this timer ever stops.
 *
 * ## Who may call it
 *
 * A caller holding `CRON_SECRET`, sent as `Authorization: Bearer ...` -- the
 * same rule, and the same secret, as the other scheduled routes. With no
 * secret set it answers 401 to everyone: this endpoint cancels orders and
 * sends money, so it fails closed. `CRON_SECRET` is set only on the admin
 * project, which is also what keeps the two deployments from both running it.
 *
 * ## It answers before it works
 *
 * Free timer services give up on a request after about thirty seconds, and
 * switch a job off after enough "failures" in a row. A pass can take longer
 * than that on a slow day at ClickPesa -- and a timer that switched itself off
 * because the site was *busy* would be the worst possible outcome. So the
 * response is sent at once and the pass runs after it (`after`). The timer
 * only ever learns "the site is up and accepted the call"; what the pass did
 * is in the `RuleRun` table and on the Rules page, which is where the owner
 * looks.
 *
 * `?wait=1` runs the pass first and answers with what it did. For trying it by
 * hand with `curl`; not for the timer.
 *
 * It answers 200 even when a rule failed: a failing rule is reported to the
 * owner by the rulebook itself, and must not teach the timer to stop calling.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (new URL(request.url).searchParams.get("wait") === "1") {
    const run = await runRulebook("timer");
    return Response.json({ ok: run.ok, skipped: run.skipped ?? null, acted: run.acted, errors: run.errors, apiCalls: run.apiCalls, summary: run.summary });
  }

  // `runRulebook` never throws; a pass that could not even start has logged why.
  after(() => runRulebook("timer").then(() => undefined));
  return Response.json({ ok: true, started: true });
}
