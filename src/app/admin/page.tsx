import type { Metadata } from "next";
import Link from "next/link";

import NotificationCheck from "@/components/admin/NotificationCheck";
import RecentErrorsPanel from "@/components/admin/RecentErrorsPanel";
import AreaChart from "@/components/admin/charts/AreaChart";
import ChartCard from "@/components/admin/charts/ChartCard";
import ColumnChart from "@/components/admin/charts/ColumnChart";
import HBarChart from "@/components/admin/charts/HBarChart";
import Sparkline from "@/components/admin/charts/Sparkline";
import StackedBar from "@/components/admin/charts/StackedBar";
import { ageLabel, BUSINESS_TIME_ZONE, dayLabel, formatTZS, formatTZSCompact } from "@/lib/charts";
import { getOverview, SERIES_DAYS, type Queue } from "@/server/admin/dashboard";
import { requireAdmin } from "@/server/auth/dal";
import { recentServerErrors } from "@/server/error-log";

export const metadata: Metadata = {
  title: "Overview",
  robots: { index: false, follow: false },
};

/** Never prerendered -- see `/admin/applications` for why an admin page must not be. */
export const dynamic = "force-dynamic";

/**
 * The console's home: what needs a person, then the numbers, then health.
 *
 * Queues first because a marketplace's worst failures are quiet ones -- an
 * order nobody rang the branch about, a payment link nobody chased. Each
 * queue shows how long its oldest item has waited, and anything past its
 * threshold is flagged in words as well as colour.
 */
export default async function AdminOverviewPage() {
  await requireAdmin("/admin");

  const [overview, recentErrors] = await Promise.all([getOverview(), recentServerErrors(10)]);
  const { isEmailConfigured, notifyAddress, notifyProvider } = await import("@/server/notify/email");
  const { now, queues, orders, money, catalogue, statusCounts, byBrand, health } = overview;

  const waitingTotal = queues.reduce((sum, q) => sum + q.count, 0);
  // Running total over the window: day N is everything collected up to day N.
  const moneyRunning = money.series.map((p, i) => ({
    day: p.day,
    value: money.series.slice(0, i + 1).reduce((sum, q) => sum + q.value, 0),
  }));
  const today = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  const statusSegments = [
    // Validated order -- see the `.viz` note in globals.css. Do not re-sort.
    { key: "cancelled", label: "Cancelled", value: statusCounts.cancelled, color: "var(--viz-cancelled)" },
    { key: "pending", label: "Pending", value: statusCounts.pending, color: "var(--viz-pending)" },
    { key: "confirmed", label: "Confirmed", value: statusCounts.confirmed, color: "var(--viz-confirmed)" },
    { key: "fulfilled", label: "Fulfilled", value: statusCounts.fulfilled, color: "var(--viz-fulfilled)" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">Overview</h1>
          <p className="mt-1 text-sm text-muted">
            {today} · as of {clock} in Dar es Salaam
          </p>
        </div>
      </header>

      {/* ---- Needs you now ---------------------------------------------- */}
      <section aria-labelledby="queues-heading" className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="queues-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Needs you now
          </h2>
          <p className="text-sm text-muted">
            {waitingTotal === 0 ? "Nothing waiting" : `${waitingTotal} waiting`}
          </p>
        </div>
        <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {queues.map((q) => (
            <QueueRow key={q.key} queue={q} now={now} />
          ))}
        </ul>
      </section>

      {/* ---- Numbers ---------------------------------------------------- */}
      <section aria-labelledby="numbers-heading" className="mt-8">
        <h2 id="numbers-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          The numbers
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
          <StatTile label="Orders, all time" value={orders.total.toLocaleString("en-US")} note={`${orders.last30} in the last ${SERIES_DAYS} days`} trend={orders.series.map((p) => p.value)} />
          <StatTile label="Money collected" value={formatTZSCompact(money.collectedTZS)} exact={formatTZS(money.collectedTZS)} note={`${formatTZSCompact(money.last30TZS)} in the last ${SERIES_DAYS} days`} trend={money.series.map((p) => p.value)} />
          <StatTile label="Held in escrow" value={formatTZSCompact(money.heldTZS)} exact={formatTZS(money.heldTZS)} note="Collected, not yet paid out" />
          <StatTile label="Live partners" value={catalogue.partnersLive.toLocaleString("en-US")} note="On the map or in the routing" />
          <StatTile label="Products listed" value={catalogue.products.toLocaleString("en-US")} note={`Across ${catalogue.brands} ${catalogue.brands === 1 ? "brand" : "brands"}`} />
        </ul>
      </section>

      {/* ---- Charts ----------------------------------------------------- */}
      <section aria-labelledby="charts-heading" className="mt-8">
        <h2 id="charts-heading" className="sr-only">Charts</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard
            title="Orders per day"
            caption={`Last ${SERIES_DAYS} days`}
            empty={orders.last30 === 0}
            emptyText={`No orders in the last ${SERIES_DAYS} days.`}
            table={{ columns: ["Day", "Orders"], rows: orders.series.map((p) => [dayLabel(p.day), p.value]) }}
          >
            <ColumnChart points={orders.series} valueFormat="count" seriesLabel="orders" integer />
          </ChartCard>

          <ChartCard
            title="Money collected, running total (TSh)"
            caption={`Last ${SERIES_DAYS} days · captured payments only · daily detail on Money`}
            empty={money.last30TZS === 0}
            emptyText="No payments captured in the last 30 days. The first one will draw here."
            table={{
              columns: ["Day", "That day", "Running total"],
              rows: moneyRunning.map((p, i) => [dayLabel(p.day), formatTZS(money.series[i].value), formatTZS(p.value)]),
            }}
          >
            <AreaChart points={moneyRunning} valueFormat="tzs" seriesLabel="Money collected so far" />
          </ChartCard>

          <ChartCard
            title="Orders by status"
            caption="All time"
            empty={orders.total === 0}
            emptyText="No orders yet."
            table={{ columns: ["Status", "Orders"], rows: statusSegments.map((s) => [s.label, s.value]) }}
          >
            <StackedBar segments={statusSegments} />
          </ChartCard>

          <ChartCard
            title="Orders by brand"
            caption="All time · top 8"
            empty={byBrand.length === 0}
            emptyText="No orders yet."
            table={{ columns: ["Brand", "Orders"], rows: byBrand.map((b) => [b.label, b.value]) }}
          >
            <HBarChart rows={byBrand} valueFormat="count" />
          </ChartCard>
        </div>
      </section>

      {/* ---- Health ----------------------------------------------------- */}
      <section aria-labelledby="health-heading" className="mt-8">
        <h2 id="health-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Health
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <HealthItem label="Database" ok detail="Answering — this page read from it" />
          <HealthItem label="Email notifications" ok={health.emailConfigured} detail={health.emailConfigured ? "Configured" : "Not configured"} />
          <HealthItem
            label="ClickPesa credentials"
            ok={health.clickpesa.clientId && health.clickpesa.apiKey}
            detail={
              health.clickpesa.clientId && health.clickpesa.apiKey
                ? health.clickpesa.checksumSecret
                  ? "Client ID, API key and checksum secret set"
                  : "Set — checksum secret missing"
                : "Client ID or API key missing"
            }
          />
          <HealthItem
            label="Payment checks"
            ok={health.cronSecret && health.lastReconciledAt !== null}
            detail={[
              health.lastReconciledAt
                ? `Last asked ClickPesa ${ageLabel(health.lastReconciledAt, now)} ago`
                : "Never asked ClickPesa yet",
              health.cronSecret ? "daily check scheduled" : "daily check off (CRON_SECRET unset)",
            ].join(" · ")}
          />
          <HealthItem
            label="Errors"
            ok={health.errors24h === 0}
            detail={`${health.errors24h} in 24 h · ${health.errors7d} in 7 days`}
          />
        </ul>

        <NotificationCheck configured={isEmailConfigured()} provider={notifyProvider()} to={notifyAddress()} />
        <RecentErrorsPanel errors={recentErrors} />
      </section>
    </div>
  );
}

const TONE: Record<Queue["tone"], { label: string; dot: string; text: string; ring: string }> = {
  clear: { label: "Clear", dot: "bg-[#0ca30c]", text: "text-muted", ring: "border-border" },
  waiting: { label: "Waiting", dot: "bg-[#fab219]", text: "text-foreground", ring: "border-border" },
  overdue: { label: "Overdue", dot: "bg-[#d03b3b]", text: "text-foreground", ring: "border-[#d03b3b]/50" },
};

function QueueRow({ queue, now }: { queue: Queue; now: Date }) {
  const tone = TONE[queue.tone];
  return (
    <li>
      <Link
        href={queue.href}
        className={`group flex items-center gap-3 rounded-xl border bg-white px-4 py-3 transition-colors hover:border-accent ${tone.ring}`}
      >
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-medium ${queue.count === 0 ? "text-muted" : "text-foreground"}`}>
            {queue.label}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            {/* Status is a word and a dot, never the dot alone. */}
            <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            <span className={queue.tone === "overdue" ? "font-semibold text-[#9b1c1c]" : ""}>{tone.label}</span>
            {queue.count > 0 && queue.oldest && <span>· oldest {ageLabel(queue.oldest, now)}</span>}
            {queue.count === 0 && <span>· {queue.hint}</span>}
          </span>
        </span>
        <span className={`text-2xl font-semibold ${queue.count === 0 ? "text-muted/60" : "text-foreground"}`}>
          {queue.count}
        </span>
        <span aria-hidden="true" className="text-muted transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </Link>
    </li>
  );
}

/**
 * Label, value, note -- and the value is compacted (TSh 7.1M) because a tile
 * is narrow and a wrapped number is unreadable. `exact` keeps the full figure
 * one hover away and in the accessible name; the Money page has the rest.
 */
function StatTile({
  label,
  value,
  exact,
  note,
  trend,
}: {
  label: string;
  value: string;
  exact?: string;
  note: string;
  trend?: number[];
}) {
  return (
    <li className="flex min-w-0 flex-col justify-between rounded-xl border border-border bg-white px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      {/* Proportional figures: tabular-nums makes a big standalone number look loose. */}
      <p className="mt-1.5 truncate text-xl font-semibold text-foreground sm:text-2xl" title={exact}>
        {value}
        {exact && exact !== value && <span className="sr-only"> ({exact})</span>}
      </p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="min-w-0 text-xs text-muted">{note}</p>
        {trend && trend.some((v) => v > 0) && <Sparkline values={trend} width={64} height={22} />}
      </div>
    </li>
  );
}

function HealthItem({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border bg-white px-4 py-3">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${ok ? "bg-[#0ca30c]" : "bg-[#d03b3b]"}`}
      >
        {ok ? "✓" : "!"}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">
          {label} <span className="sr-only">{ok ? "— OK" : "— needs attention"}</span>
        </span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
    </li>
  );
}
