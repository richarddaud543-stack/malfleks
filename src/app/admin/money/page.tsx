import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { CheckAllPaymentsButton, CheckPaymentButton } from "@/components/admin/CheckPaymentButtons";
import ChartCard from "@/components/admin/charts/ChartCard";
import ColumnChart from "@/components/admin/charts/ColumnChart";
import { ageLabel, dayLabel, formatTZS } from "@/lib/charts";
import { getMoneyOverview, MONEY_SERIES_DAYS } from "@/server/admin/money";
import { requireAdmin } from "@/server/auth/dal";
import { logServerError } from "@/server/error-log";
import { reconcileDue } from "@/server/payments/reconcile";

export const metadata: Metadata = {
  title: "Money",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Where every shilling is: collected, held in escrow, paid out, and the
 * payments still waiting.
 *
 * Opening this page asks ClickPesa about up to three open payments that have
 * not been checked in half an hour -- so if a customer has just paid, looking
 * here is enough to see it recorded, whether or not the webhook got through.
 * The cap and the half-hour keep that from spending the account's 100 API
 * calls a day on someone refreshing the page.
 */
export default async function AdminMoneyPage() {
  await requireAdmin("/admin/money");

  const ready = Boolean(process.env.CLICKPESA_CLIENT_ID?.trim() && process.env.CLICKPESA_API_KEY?.trim());
  if (ready) {
    await reconcileDue({ staleAfterMinutes: 30, limit: 3 }).catch((error) =>
      logServerError("clickpesa-reconcile-pageload", error),
    );
  }

  const money = await getMoneyOverview();
  const now = new Date();
  const { totals } = money;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">Money</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Customers pay MalFleks; MalFleks holds it until the order is delivered.{" "}
            {money.lastReconciledAt
              ? `Last checked with ClickPesa ${ageLabel(money.lastReconciledAt, now)} ago.`
              : "Not checked with ClickPesa yet."}
          </p>
        </div>
        <CheckAllPaymentsButton disabled={!money.reconcilerReady || totals.awaitingCount === 0} />
      </header>

      {!money.reconcilerReady && (
        <p role="status" className="mt-4 rounded-xl border border-[#d03b3b]/40 bg-[#d03b3b]/5 px-4 py-3 text-sm">
          <strong>Payment checks are off on this deployment</strong> — <code>CLICKPESA_CLIENT_ID</code> or{" "}
          <code>CLICKPESA_API_KEY</code> is not set, so nothing here can ask ClickPesa what happened.
        </p>
      )}

      <ul className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile label="Collected" value={formatTZS(totals.collectedTZS)} note={`${totals.capturedCount} ${totals.capturedCount === 1 ? "payment" : "payments"} captured`} />
        <Tile
          label="Held in escrow"
          value={formatTZS(totals.heldTZS)}
          note={totals.refundedTZS > 0 ? `After ${formatTZS(totals.refundedTZS)} refunded and payouts sent` : "Collected, less payouts sent"}
          emphasis
        />
        <Tile label="Waiting to be paid" value={formatTZS(totals.awaitingTZS)} note={`${totals.awaitingCount} open ${totals.awaitingCount === 1 ? "link" : "links"}`} />
        <Tile
          label="Paid out to partners"
          value={formatTZS(totals.paidOutTZS)}
          note={totals.owedTZS + totals.inPayoutsTZS > 0 ? `${formatTZS(totals.owedTZS + totals.inPayoutsTZS)} owed, not sent yet` : "Nothing owed right now"}
        />
      </ul>

      <div className="mt-3">
        <ChartCard
          title="Money collected per day (TSh)"
          caption={`Last ${MONEY_SERIES_DAYS} days · from the ledger`}
          empty={money.series.every((p) => p.value === 0)}
          emptyText="Nothing collected in the last 30 days. The first captured payment will draw here."
          table={{ columns: ["Day", "Collected"], rows: money.series.map((p) => [dayLabel(p.day), formatTZS(p.value)]) }}
        >
          <ColumnChart points={money.series} valueFormat="tzs" seriesLabel="collected" />
        </ChartCard>
      </div>

      <section aria-labelledby="payments-heading" className="mt-8">
        <h2 id="payments-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Payments
        </h2>
        {money.payments.length === 0 ? (
          <Empty>No payment links have been sent yet. &ldquo;Send payment link&rdquo; on a confirmed order creates one.</Empty>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th scope="col" className="px-4 py-2.5 font-medium">Order</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">ClickPesa says</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Sent</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {money.payments.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 align-top last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/admin/orders/${p.orderId}`} className="font-medium tabular-nums text-accent hover:underline">
                        {p.orderReference}
                      </Link>
                      <p className="text-xs text-muted">
                        {p.customerName} · {p.brandName} · {p.productName}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{formatTZS(p.amountTZS)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                      {p.status === "captured" && p.capturedAt && (
                        <p className="mt-1 text-xs text-muted">{ageLabel(p.capturedAt, now)} ago</p>
                      )}
                      {p.failureNote && <p className="mt-1 text-xs text-muted">{p.failureNote}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {p.providerStatus ? (
                        <>
                          <p className="font-medium">{p.providerStatus.replaceAll("_", " ").toLowerCase()}</p>
                          {p.lastCheckedAt && <p className="text-muted">checked {ageLabel(p.lastCheckedAt, now)} ago</p>}
                        </>
                      ) : (
                        <p className="text-muted">Not checked yet</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{ageLabel(p.initiatedAt, now)} ago</td>
                    <td className="px-4 py-3">
                      {p.status !== "captured" && money.reconcilerReady && <CheckPaymentButton paymentId={p.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="ledger-heading" className="mt-8">
        <h2 id="ledger-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Ledger
        </h2>
        <p className="mt-1 text-xs text-muted">The book of record. Entries are only ever added, never edited.</p>
        {money.ledger.length === 0 ? (
          <Empty>No ledger entries yet. One is written the moment a payment is captured.</Empty>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th scope="col" className="px-4 py-2.5 font-medium">When</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Order</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Entry</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {money.ledger.map((e) => (
                  <tr key={e.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 text-xs text-muted">{ageLabel(e.createdAt, now)} ago</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      <Link href={`/admin/orders/${e.orderId}`} className="text-accent hover:underline">
                        {e.orderReference}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{LEDGER_LABEL[e.kind] ?? e.kind}</span>
                      {e.note && <span className="ml-2 text-xs text-muted">{e.note}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatTZS(e.amountTZS)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="payouts-heading" className="mt-8">
        <h2 id="payouts-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Payouts to partners
        </h2>
        <p className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm">
          <span>
            {totals.owedTZS + totals.inPayoutsTZS > 0
              ? `${formatTZS(totals.owedTZS + totals.inPayoutsTZS)} is owed to branches and couriers for delivered orders. MalFleks has earned ${formatTZS(totals.feesEarnedTZS)} in fees.`
              : `Nobody is owed anything right now. MalFleks has earned ${formatTZS(totals.feesEarnedTZS)} in fees.`}
          </span>
          <Link href="/admin/payouts" className="font-medium text-accent hover:underline">
            Payouts →
          </Link>
        </p>
      </section>
    </div>
  );
}

function Tile({ label, value, note, emphasis }: { label: string; value: string; note: string; emphasis?: boolean }) {
  return (
    <li className={`rounded-xl border bg-white px-4 py-3 ${emphasis ? "border-accent" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1.5 text-xl font-semibold sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </li>
  );
}

const LEDGER_LABEL: Record<string, string> = {
  collected: "Collected from customer",
  branch_payout: "Owed to branch",
  courier_payout: "Owed to courier",
  malfleks_fee: "MalFleks fees",
  refund: "Refunded to customer",
  reversal: "Reversal",
};

const BADGE: Record<string, string> = {
  captured: "bg-[#0ca30c]/10 text-[#006300]",
  paid: "bg-[#0ca30c]/10 text-[#006300]",
  pending: "bg-[#fab219]/15 text-[#6b4a00]",
  failed: "bg-[#d03b3b]/10 text-[#9b1c1c]",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${BADGE[status] ?? "bg-border/40 text-muted"}`}>
      {status}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-muted">{children}</p>;
}
