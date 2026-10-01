import type { Metadata } from "next";
import Link from "next/link";

import { cancelPayoutAction, createPayoutAction, markPayoutPaidAction } from "@/app/actions/admin-console";
import ActionForm from "@/components/admin/ActionForm";
import { Badge, Card, Empty, inputClass, labelClass, Notice, PageHeader, plural, Section, Tile, Tiles } from "@/components/admin/ui";
import { ageLabel, formatTZS, formatWhen } from "@/lib/charts";
import { formatPhone } from "@/lib/order";
import { requireAdmin } from "@/server/auth/dal";
import { listOwed, listPayoutBatches, moneyTotals, moneyWork } from "@/server/money/payouts";
import { MIN_MOBILE_PAYOUT_TZS } from "@/server/money/payout-rules";

export const metadata: Metadata = {
  title: "Payouts",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Paying partners what they're owed, by hand.
 *
 * When an order is delivered, the money held for it is split into the
 * branch's share, the courier's share and MalFleks's fees. This page groups
 * the partner shares by who they're owed to. The flow is three steps, and
 * nothing here sends money:
 *
 *  1. "Draw up payout" — freezes what's owed into one payout.
 *  2. Send it from the ClickPesa dashboard (Payout → Create Payout).
 *  3. "Record as sent" with the reference ClickPesa shows.
 */
export default async function AdminPayoutsPage() {
  await requireAdmin("/admin/payouts");

  const [owed, batches, totals, work] = await Promise.all([listOwed(), listPayoutBatches(), moneyTotals(), moneyWork()]);
  const now = new Date();
  const toSend = batches.filter((b) => b.status === "pending");
  const history = batches.filter((b) => b.status !== "pending");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Payouts"
        description="What branches and couriers are owed for delivered orders. Nothing here sends money — you send each payout from the ClickPesa dashboard, then record it here."
        actions={
          <a
            href="https://merchant.clickpesa.com/"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border bg-white px-3.5 py-1.5 text-sm font-medium hover:border-accent"
          >
            Open ClickPesa ↗
          </a>
        }
      />

      <Tiles>
        <Tile label="Owed, not drawn up" value={formatTZS(totals.owedTZS)} note={plural(owed.payees.length, "partner")} emphasis />
        <Tile label="Drawn up, to send" value={formatTZS(totals.inPayoutsTZS)} note={plural(toSend.length, "payout")} />
        <Tile label="Sent so far" value={formatTZS(totals.paidOutTZS)} note={plural(history.filter((b) => b.status === "paid").length, "payout")} />
        <Tile label="MalFleks fees earned" value={formatTZS(totals.feesEarnedTZS)} note="Kept from delivered orders" />
      </Tiles>

      {work.refundsDue.length > 0 && (
        <Notice tone="danger">
          <strong>
            {work.refundsDue.length} cancelled {work.refundsDue.length === 1 ? "order still holds" : "orders still hold"} customer money:
          </strong>{" "}
          {work.refundsDue.map((r, i) => (
            <span key={r.orderId}>
              {i > 0 && ", "}
              <Link href={`/admin/orders/${r.orderId}`} className="font-mono text-accent underline underline-offset-2">
                {r.reference}
              </Link>{" "}
              ({formatTZS(r.refundableTZS)})
            </span>
          ))}
          . Refund and record it on the order.
        </Notice>
      )}

      <Section id="to-send" title="1 · Drawn up, waiting to be sent" note="Send each from ClickPesa, then record the reference it gives you.">
        {toSend.length === 0 ? (
          <Empty>Nothing waiting to be sent.</Empty>
        ) : (
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {toSend.map((b) => (
              <li key={b.id}>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {b.partnerId ? (
                          <Link href={`/admin/partners/${b.partnerId}`} className="text-accent hover:underline">
                            {b.name}
                          </Link>
                        ) : (
                          b.name
                        )}
                      </p>
                      <p className="text-xs text-muted">{b.detail}</p>
                    </div>
                    <p className="text-xl font-semibold tabular-nums">{formatTZS(b.totalTZS)}</p>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-[#f4f7f5] p-3 text-xs">
                    <div>
                      <dt className="text-muted">Send to (mobile money)</dt>
                      <dd className="mt-0.5 select-all font-mono text-sm">{b.payoutPhone ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Amount</dt>
                      <dd className="mt-0.5 select-all font-mono text-sm">{b.totalTZS}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted">Covers</dt>
                      <dd className="mt-0.5">
                        {b.orderReferences.length} {b.orderReferences.length === 1 ? "order" : "orders"}: {b.orderReferences.join(", ")}
                      </dd>
                    </div>
                  </dl>
                  {!b.payoutPhone && (
                    <p className="mt-2 text-xs text-[#9b1c1c]">
                      No mobile number on file{b.phone ? ` (${b.phone} isn't one)` : ""}. Confirm how they want to be paid before sending.
                    </p>
                  )}
                  {b.totalTZS < MIN_MOBILE_PAYOUT_TZS && (
                    <p className="mt-2 text-xs text-[#6b4a00]">
                      Under {formatTZS(MIN_MOBILE_PAYOUT_TZS)}, ClickPesa&apos;s minimum for a mobile payout. Cancel it and let more build up, or
                      pay another way.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted">Drawn up {ageLabel(b.createdAt, now)} ago.</p>

                  <ActionForm className="mt-3" action={markPayoutPaidAction} hidden={{ batchId: b.id }} label="Record as sent" pendingLabel="Recording…" tone="primary">
                    <label className={labelClass} htmlFor={`ref-${b.id}`}>
                      ClickPesa payout reference
                    </label>
                    <input id={`ref-${b.id}`} name="reference" required autoComplete="off" placeholder="e.g. 0E7A1B2C" className={inputClass} />
                  </ActionForm>
                  <ActionForm
                    className="mt-3 border-t border-border/60 pt-3"
                    action={cancelPayoutAction}
                    hidden={{ batchId: b.id }}
                    label="Cancel this payout"
                    size="xs"
                    tone="danger"
                    confirm="It won't be sent; what it covers becomes owed again."
                    confirmLabel="Yes, cancel it"
                  >
                    <label className={labelClass} htmlFor={`why-${b.id}`}>
                      Why?
                    </label>
                    <input id={`why-${b.id}`} name="reason" maxLength={200} className={inputClass} />
                  </ActionForm>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="owed" title="2 · Owed, not yet drawn up" note="Oldest first. Drawing up a payout freezes the amount so it can't change while you send it.">
        {owed.payees.length === 0 ? (
          <Empty>Nobody is owed anything right now. Shares appear here when a paid order is marked delivered.</Empty>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {owed.payees.map((p) => (
              <li key={`${p.payeeType}:${p.payeeId}`} className="rounded-xl border border-border bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {p.partnerId ? (
                        <Link href={`/admin/partners/${p.partnerId}`} className="text-accent hover:underline">
                          {p.name}
                        </Link>
                      ) : (
                        p.name
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {p.detail} · {p.entries.length} {p.entries.length === 1 ? "order" : "orders"} · oldest {ageLabel(p.oldestAt, now)} ago
                      {p.phone && ` · ${formatPhone(p.phone)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold tabular-nums">{formatTZS(p.totalTZS)}</span>
                    <ActionForm
                      action={createPayoutAction}
                      hidden={{ payeeType: p.payeeType, payeeId: p.payeeId }}
                      label="Draw up payout"
                      pendingLabel="Drawing up…"
                      tone="primary"
                      confirm={p.belowMinimum ? `Below ClickPesa's ${formatTZS(MIN_MOBILE_PAYOUT_TZS)} minimum — draw up anyway?` : undefined}
                      confirmLabel="Yes, draw it up"
                    />
                  </div>
                </div>
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-muted">Which orders</summary>
                  <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                    {p.entries.map((e) => (
                      <li key={e.id} className="flex justify-between gap-2 tabular-nums">
                        <Link href={`/admin/orders/${e.orderId}`} className="font-mono text-accent hover:underline">
                          {e.orderReference}
                        </Link>
                        <span>{formatTZS(e.amountTZS)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
        {owed.unassigned.length > 0 && (
          <Notice tone="warn">
            <strong>{formatTZS(owed.unassigned.reduce((s, e) => s + e.amountTZS, 0))} is owed on orders whose branch or courier has since been removed:</strong>{" "}
            {owed.unassigned.map((e) => e.orderReference).join(", ")}. There is nobody to pay it to automatically — sort it out by hand.
          </Notice>
        )}
      </Section>

      <Section id="history" title="Sent and cancelled">
        {history.length === 0 ? (
          <Empty>No payouts sent yet.</Empty>
        ) : (
          <ul className="mt-3 divide-y divide-border/60 rounded-xl border border-border bg-white">
            {history.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{b.name}</span>
                  <span className="block text-xs text-muted">
                    {b.status === "paid"
                      ? `Sent ${b.paidAt ? formatWhen(b.paidAt) : ""} · ref ${b.reference}`
                      : `Cancelled ${b.failedAt ? formatWhen(b.failedAt) : ""}${b.failureNote ? ` — ${b.failureNote}` : ""}`}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <Badge status={b.status} label={b.status === "failed" ? "cancelled" : "sent"} />
                  <span className="font-semibold tabular-nums">{formatTZS(b.totalTZS)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
