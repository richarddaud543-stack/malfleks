import { runAgent } from "@/agents/runtime";

export const dynamic = "force-dynamic";

/**
 * The door a scheduler knocks on: `GET /api/agents/<key>`.
 *
 * ## Who may call it
 *
 * Only a caller holding `CRON_SECRET`, sent as `Authorization: Bearer …`. With
 * no secret set this answers 401 to everyone — fail closed, the same way
 * `/api/cron/reconcile` does, and deliberately the opposite of the admin
 * hostname lock, which fails open so a typo cannot lock the owner out of a
 * read-only console. This endpoint runs work and writes rows; an accidentally
 * open door costs more than an accidentally locked one.
 *
 * That is also what keeps the two deployments from both working the same
 * shift: `CRON_SECRET` is set only on the admin project.
 *
 * ## Why this exists when the city page can already run a shift
 *
 * The schedule must not depend on a person being signed in, and the caller
 * must not be tied to one hosting plan. This takes a bearer token and does not
 * care who holds it: Vercel Cron, a GitHub workflow, an outside timer, or
 * `curl` from the owner's laptop. The schedule is configuration, never an
 * architectural commitment.
 *
 * It answers 200 for a shift that found problems and 200 for one that was
 * skipped: both are the agent working as designed. Only a shift that *threw*
 * is a 500, so an uptime check on this URL means "the harness is healthy", not
 * "the business is fine" — the business is the archive's job to report.
 */
export async function GET(request: Request, context: { params: Promise<{ agent: string }> }): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { agent } = await context.params;
  const outcome = await runAgent(agent, "schedule");
  if (!outcome.ok) return Response.json({ ok: false, reason: outcome.reason }, { status: 404 });

  const { run } = outcome;
  return Response.json(
    {
      ok: run.outcome !== "error",
      agent: run.agentKey,
      outcome: run.outcome,
      summary: run.summary,
      findings: run.findings,
      metrics: run.metrics,
      tookMs: run.finishedAt.getTime() - run.startedAt.getTime(),
    },
    { status: run.outcome === "error" ? 500 : 200 },
  );
}
