import type { Metadata } from "next";
import Link from "next/link";

import {
  alertHandlingAction,
  alertResolveAction,
  restoreListingsAction,
  retryRefundAction,
  runRulesNowAction,
  setRuleOffAction,
  setRulebookPausedAction,
} from "@/app/actions/admin-rules";
import ActionForm from "@/components/admin/ActionForm";
import { Badge, Card, Empty, Notice, PageHeader, plural, Section, Tile, Tiles } from "@/components/admin/ui";
import { formatTZS, formatWhen } from "@/lib/charts";
import { readRulesPage, type RuleRow, type RulesPage } from "@/server/admin/rules";
import { requireAdmin } from "@/server/auth/dal";
import { logServerError } from "@/server/error-log";

export const metadata: Metadata = {
  title: "Rules",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// "Run now" runs a whole pass inside a Server Action on this page; see
// `PASS_BUDGET_MS` in src/server/rules/engine.ts.
export const maxDuration = 60;

/**
 * The rulebook, for the person it works for.
 *
 * Three questions, in the order he will ask them on a visit: *is it running*,
 * *what does it need from me*, and *what did it do while I was away*. Then the
 * rules themselves, in his own words, each with its switch.
 *
 * The page is the view; it does none of the work. Every rule runs in
 * `src/server/rules`, started by a timer, and would keep running with this
 * page deleted.
 */

function ago(then: Date | null, now: Date): string {
  if (!then) return "never";
  const minutes = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

const SKIP_WORDS: Record<string, string> = {
  off: "switched off",
  paused: "paused",
  "no-gateway": "waiting for ClickPesa",
  "out-of-time": "ran out of time; next pass",
};

function lastWords(rule: RuleRow): string {
  const last = rule.last;
  if (!last) return "Has not run yet.";
  if (last.error) return `Failed last pass: ${last.error}`;
  if (last.skipped) return `Last pass: ${SKIP_WORDS[last.skipped] ?? last.skipped}.`;
  if (last.notes.length > 0) return `Last pass: ${last.notes.join(" ")}`;
  return "Last pass: nothing needed doing.";
}

function RuleCard({ rule, paused }: { rule: RuleRow; paused: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-display text-base font-medium tracking-tight">{rule.title}</h3>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {rule.movesMoney && <Badge status="owed" label="moves money" />}
          {rule.off ? <Badge status="cancelled" label="off" /> : paused && !rule.alwaysRuns ? <Badge status="pending" label="paused" /> : <Badge status="active" label="on" />}
        </div>
      </div>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">When</dt>
          <dd className="mt-0.5">{rule.when}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Then</dt>
          <dd className="mt-0.5">{rule.then}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className={`min-w-0 text-xs ${rule.last?.error ? "text-[#b42318]" : "text-muted"}`}>{lastWords(rule)}</p>
        <ActionForm
          action={setRuleOffAction}
          hidden={{ ruleKey: rule.key, off: rule.off ? "false" : "true" }}
          label={rule.off ? "Switch on" : "Switch off"}
          size="xs"
          tone={rule.off ? "primary" : "neutral"}
          ariaLabel={`${rule.off ? "Switch on" : "Switch off"}: ${rule.title}`}
        />
      </div>
    </Card>
  );
}

function AlertCard({ alert, now }: { alert: RulesPage["alerts"][number]; now: Date }) {
  const handling = alert.status === "handling";
  return (
    <Card className={`p-4 ${alert.urgency === "urgent" && !handling ? "border-[#d03b3b]/50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="min-w-0 font-medium">{alert.subject}</h3>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {alert.urgency === "urgent" && <Badge status="failed" label="urgent" />}
          {handling && <Badge status="confirmed" label="you are handling it" />}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">
        Raised {formatWhen(alert.createdAt)} ({ago(alert.createdAt, now)})
        {alert.emailedAt ? " · emailed" : " · email not sent"}
        {alert.textedAt ? " · texted" : ""}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm">{alert.body}</p>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        {alert.href && alert.href !== "/admin/rules" && (
          <Link href={alert.href} className="rounded-md border border-accent bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent/90">
            Open it
          </Link>
        )}
        {alert.key === "shop-reliability" && (
          <ActionForm
            action={restoreListingsAction}
            hidden={{ id: alert.id }}
            label="Put the products back"
            size="xs"
            tone="primary"
            confirm={<span className="text-xs text-muted">Their products go back on the shop and the shop starts with a clean count.</span>}
            confirmLabel="Put them back"
          />
        )}
        {alert.refundRetryOrderId && (
          <ActionForm
            action={retryRefundAction}
            hidden={{ id: alert.id, orderId: alert.refundRetryOrderId }}
            label="Try the refund again"
            size="xs"
            tone="primary"
            confirm={<span className="text-xs text-muted">Only if you have fixed what stopped it. It goes on the next pass.</span>}
            confirmLabel="Try again"
          />
        )}
        {!handling && <ActionForm action={alertHandlingAction} hidden={{ id: alert.id }} label="I'm handling this" size="xs" />}
        <ActionForm
          action={alertResolveAction}
          hidden={{ id: alert.id }}
          label="Done"
          size="xs"
          confirm={<span className="text-xs text-muted">Closes it. If the problem is still there it will be raised again.</span>}
          confirmLabel="Close it"
        />
      </div>
    </Card>
  );
}

export default async function AdminRulesPage() {
  await requireAdmin("/admin/rules");

  // The page is only a view. If it cannot be read (the database is briefly
  // unreachable), say so plainly rather than show a bare error screen -- and
  // say the one thing the owner needs to know: the rules do not depend on it.
  let page: RulesPage;
  try {
    page = await readRulesPage();
  } catch (error) {
    await logServerError("admin-rules-page", error);
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Rules" description="What MalFleks does by itself while you are away." />
        <Notice tone="danger">
          <strong>This page could not be loaded just now.</strong> It has been logged. The rules themselves do not depend on this page and carry on running; try
          again in a minute.
        </Notice>
      </div>
    );
  }
  const { clock, gateway, money, now } = page;
  const urgent = page.alerts.filter((a) => a.urgency === "urgent" && a.status === "open").length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Rules"
        description="What MalFleks does by itself while you are away. Each rule is a condition and what happens when it holds. You only need to come here for what is listed under “Waiting on you”."
        actions={
          <>
            <ActionForm action={runRulesNowAction} label="Run now" pendingLabel="Running…" />
            <ActionForm
              action={setRulebookPausedAction}
              hidden={{ paused: page.paused ? "false" : "true" }}
              label={page.paused ? "Start the rules" : "Pause all rules"}
              tone={page.paused ? "primary" : "danger"}
              confirm={page.paused ? undefined : <span className="text-xs text-muted">Nothing will be reminded, cancelled, refunded or paid until you start them again.</span>}
              confirmLabel="Pause them"
            />
          </>
        }
      />

      {page.paused && (
        <Notice tone="warn">
          <strong>The rules are paused.</strong> ClickPesa is still watched and money already sent is still followed up, but nothing else happens until you start them
          again. A payout that goes the moment a delivery code is entered is controlled separately, on the <Link href="/admin/payouts" className="underline">Payouts page</Link>.
        </Notice>
      )}
      {gateway.down && (
        <Notice tone="danger">
          <strong>ClickPesa is not answering.</strong> Customers cannot pay and no money can be sent. Down since {gateway.state ? formatWhen(new Date(gateway.state.since)) : "—"}
          {gateway.state?.detail ? ` — “${gateway.state.detail}”` : ""}. Unpaid orders are not being cancelled while this lasts.
        </Notice>
      )}
      {clock.state !== "running" && (
        <Notice tone="warn">
          <strong>{clock.state === "never" ? "The 15-minute timer is not set up yet." : `The 15-minute timer has stopped (last call ${ago(clock.lastTimerAt, now)}).`}</strong>{" "}
          Until it is running the rules run once a day only. The steps are at the bottom of this page.
        </Notice>
      )}

      <Tiles>
        <Tile
          label="15-minute clock"
          value={clock.state === "running" ? "Running" : clock.state === "stopped" ? "Stopped" : "Not set up"}
          note={`Last pass ${ago(clock.lastRunAt, now)} · ${clock.timerPassesToday} of 96 in 24 h`}
          emphasis={clock.state !== "running"}
        />
        <Tile
          label="ClickPesa"
          value={gateway.down ? "Down" : gateway.state?.status === "up" ? "Answering" : "Not known"}
          note={`Checked ${gateway.state ? ago(new Date(gateway.state.checkedAt), now) : "never"} · ${clock.apiCallsToday} of ${clock.apiDailyBudget} checks used today`}
          emphasis={gateway.down}
        />
        <Tile
          label="Sending money"
          value={money.active ? "On" : money.armed ? "Paused" : "Off"}
          note={
            money.armed
              ? `${formatTZS(money.sentTodayTZS)} sent today · limit ${formatTZS(money.maxPerDayTZS)} a day, ${formatTZS(money.maxPerPayoutTZS)} each`
              : "Refunds and payouts are sent by hand until this is switched on for the site"
          }
        />
        <Tile label="Waiting on you" value={page.alerts.length} note={urgent > 0 ? `${urgent} urgent` : "Nothing urgent"} emphasis={urgent > 0} />
      </Tiles>

      <Section
        id="waiting"
        title="Waiting on you"
        note={`A rule raises one of these when it reaches something only you can decide. You are emailed once for each${page.texting === "ready" ? ", and texted for the urgent ones" : ""}.`}
      >
        {page.alerts.length === 0 ? (
          <Empty>Nothing is waiting. The rules will bring anything they cannot settle here.</Empty>
        ) : (
          <ul className="mt-3 space-y-3">
            {page.alerts.map((alert) => (
              <li key={alert.id}>
                <AlertCard alert={alert} now={now} />
              </li>
            ))}
          </ul>
        )}
        {page.texting !== "ready" && (
          <p className="mt-2 text-xs text-muted">
            {page.texting === "no-provider"
              ? "Urgent alerts are emailed only for now: text messages are not set up on the site yet."
              : "Urgent alerts are emailed only for now: your phone number (MALFLEKS_OWNER_PHONE) is not set on the site."}
          </p>
        )}
      </Section>

      <Section id="activity" title="What the rules did" note="Only passes in which something happened. A quiet pass is counted in the clock above and not listed.">
        {page.activity.length === 0 ? (
          <Empty>Nothing yet. The first pass that reminds, cancels, refunds or pays anyone will be listed here.</Empty>
        ) : (
          <Card className="mt-3 divide-y divide-border">
            {page.activity.map((run) => (
              <div key={run.id} className="px-4 py-3">
                <p className="text-xs text-muted">
                  {formatWhen(run.startedAt)} · {run.trigger === "timer" ? "15-minute timer" : run.trigger === "daily" ? "daily job" : "you pressed Run now"}
                  {run.errors > 0 ? ` · ${plural(run.errors, "rule")} failed` : ""}
                </p>
                <p className={`mt-0.5 text-sm ${run.errors > 0 ? "text-[#b42318]" : ""}`}>{run.summary}</p>
              </div>
            ))}
          </Card>
        )}
      </Section>

      {page.groups.map((group) => (
        <Section id={`rules-${group.group}`} key={group.group} title={group.title} note={plural(group.rules.length, "rule")}>
          <ul className="mt-3 space-y-3">
            {group.rules.map((rule) => (
              <li key={rule.key}>
                <RuleCard rule={rule} paused={page.paused} />
              </li>
            ))}
          </ul>
        </Section>
      ))}

      <Section id="timer" title="The 15-minute timer" note="The rules are started by a free outside timer that calls the site. Set it up once.">
        <Card className="mt-3 p-4 text-sm">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Create a free account at <span className="font-medium">cron-job.org</span> and add one job.
            </li>
            <li>
              Address to call: <code className="break-all rounded bg-border/40 px-1.5 py-0.5 text-xs">{page.timerUrl}</code> — every 15 minutes.
            </li>
            <li>
              Under the job&rsquo;s advanced settings add one header. Name: <code className="rounded bg-border/40 px-1.5 py-0.5 text-xs">Authorization</code>. Value: the word{" "}
              <code className="rounded bg-border/40 px-1.5 py-0.5 text-xs">Bearer</code>, a space, then the site&rsquo;s <code className="rounded bg-border/40 px-1.5 py-0.5 text-xs">CRON_SECRET</code>{" "}
              (in Vercel, on the admin project, under Environment Variables). Type it in yourself; never paste it into a chat or an email.
            </li>
            <li>Switch on the job&rsquo;s &ldquo;notify me when it fails&rdquo; option, so the timer service also tells you if it cannot reach the site.</li>
          </ol>
          <p className="mt-3 text-xs text-muted">
            {page.cronSecretSet ? "CRON_SECRET is set on this site." : "CRON_SECRET is NOT set on this site, so every call is refused. Set it in Vercel first."} Within 15 minutes of
            saving the job, the clock tile above should say Running.
          </p>
        </Card>
      </Section>

      {page.resolved.length > 0 && (
        <Section id="closed" title="Recently closed" note="The last few things that were waiting and no longer are.">
          <Card className="mt-3 divide-y divide-border">
            {page.resolved.map((alert) => (
              <div key={alert.id} className="px-4 py-2.5 text-sm">
                <span className="text-muted">{alert.resolvedAt ? formatWhen(alert.resolvedAt) : ""} · </span>
                {alert.subject}
              </div>
            ))}
          </Card>
        </Section>
      )}
    </div>
  );
}
