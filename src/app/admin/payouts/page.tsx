import type { Metadata } from "next";
import Link from "next/link";

import {
  cancelPayoutAction,
  compareBalanceAction,
  createPayoutAction,
  markPayoutPaidAction,
  runAutoPayoutsAction,
  setAutoPayoutsPausedAction,
} from "@/app/actions/admin-console";
import ActionForm from "@/components/admin/ActionForm";
import { Badge, Card, Empty, inputClass, labelClass, Notice, PageHeader, plural, Section, Tile, Tiles } from "@/components/admin/ui";
import { ageLabel, formatTZS, formatWhen } from "@/lib/charts";
import { formatPhone } from "@/lib/order";
import { requireAdmin } from "@/server/auth/dal";
import { autoPayoutStatus } from "@/server/money/auto-payouts";
import { listOwed, listPayoutBatches, moneyTotals, moneyWork } from "@/server/money/payouts";
import { MIN_MOBILE_PAYOUT_TZS } from "@/server/money/payout-rules";

export const metadata: Metadata = {
  title: "Payouts",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// A payout run can follow an action on this page (see
// src/server/money/auto-payouts.ts): a balance preview, one send and a few
// status checks against ClickPesa. Sixty seconds is well over what that takes
// and stops the platform cutting it off part-way.
export const maxDuration = 60;

/**
 * Paying partners what they're owed.
 *
 * Since 5 Oct 2026 this can happen without anyone here: once a delivery is
 * confirmed by the customer's code, `auto-payouts.ts` sends the partner's
 * share through ClickPesa. The "Automatic payouts" section shows whether that
 * is on, lets an admin pause it, and lists any payout still waiting on
 * ClickPesa's answer. Everything below it is the by-hand flow, which remains
 * for whatever the automatic run leaves (no mobile number, under the minimum,
 * over a ceiling) and for when it is off.
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

  const now = new Date();
  const [owed, batches, totals, work, auto] = await Promise.all([listOwed(), listPayoutBatches(), moneyTotals(), moneyWork(), autoPayoutStatus(now)]);
  const toSend = batches.filter((b) => b.status === "pending");
  // Sent by MalFleks itself and not yet answered by ClickPesa. Never re-sent
  // automatically; settled by ClickPesa's answer or by an admin below.
  const sending = batches.filter((b) => b.status === "sending");
  const history = batches.filter((b) => b.status !== "pending" && b.status !== "sending");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Payouts"
        description={
          auto.active
            ? "What branches and couriers are owed for delivered orders. Automatic payouts are on: once a delivery is confirmed, the partner's share is sent through ClickPesa without you. Anything it can't send is left here for you."
            : "What branches and couriers are owed for delivered orders. Automatic payouts are not running, so nothing here sends money — you send each payout from the ClickPesa dashboard, then record it here."
        }
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

      <Section
        id="automatic"
        title="Automatic payouts"
        note={
          !auto.armed
            ? "Switched off for this site. To switch on, set AUTO_PAYOUTS=on in the hosting settings — do it only once the ClickPesa account is verified."
            : auto.paused
              ? "Paused by you. Payouts already sent are not affected."
              : `On. Up to ${formatTZS(auto.maxPerPayoutTZS)} per payout and ${formatTZS(auto.maxPerDayTZS)} a day; ${formatTZS(auto.sentTodayTZS)} sent today.`
        }
      >
        <Card className="mt-3 p-4">
          <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Badge status={auto.active ? "paid" : auto.armed ? "pending" : "failed"} label={auto.active ? "on" : auto.armed ? "paused" : "off"} />
              {auto.active ? "Confirmed deliveries are paid without you." : auto.armed ? "Nothing is sent until you resume." : "Payouts are sent by hand."}
            </p>
            {auto.armed && (
              <ActionForm
                action={setAutoPayoutsPausedAction}
                hidden={{ paused: auto.paused ? "false" : "true" }}
                label={auto.paused ? "Resume automatic payouts" : "Pause automatic payouts"}
                tone={auto.paused ? "primary" : "danger"}
                confirm={auto.paused ? "Owed shares will be sent through ClickPesa again without you." : "Nothing more is sent automatically until you resume. You can still pay by hand."}
                confirmLabel={auto.paused ? "Yes, resume" : "Yes, pause"}
              />
            )}
            <ActionForm
              action={runAutoPayoutsAction}
              label={auto.active ? "Run now" : "Check payouts on their way"}
              pendingLabel="Asking ClickPesa…"
              confirm={auto.active ? "Sends one owed payout through ClickPesa now, and checks any still on their way." : undefined}
              confirmLabel="Yes, run"
            />
            <ActionForm action={compareBalanceAction} label="Compare with ClickPesa balance" pendingLabel="Asking ClickPesa…" />
          </div>
          <p className="mt-3 text-xs text-muted">
            A payout is only sent after the customer&apos;s delivery code was entered (or you marked the order delivered yourself). Mobile-money
            payouts can&apos;t be pulled back, so this never sends the same payout twice: one it gets no clear answer for is held below as
            &ldquo;on its way&rdquo; until ClickPesa says what happened.
          </p>
        </Card>
      </Section>

      {sending.length > 0 && (
        <Section id="sending" title="On their way" note="Sent to ClickPesa by MalFleks; waiting for ClickPesa to confirm. Do not send these again by hand without checking ClickPesa first.">
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {sending.map((b) => (
              <li key={b.id}>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-muted">
                        {b.detail} · to {b.payoutPhone ?? "—"} · asked {b.sendStartedAt ? `${ageLabel(b.sendStartedAt, now)} ago` : ""}
                      </p>
                    </div>
                    <p className="text-xl font-semibold tabular-nums">{formatTZS(b.totalTZS)}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Look it up in ClickPesa under reference <span className="select-all font-mono">{b.sendRef}</span>. Covers {b.orderReferences.join(", ")}.
                  </p>
                  <ActionForm
                    className="mt-3"
                    action={markPayoutPaidAction}
                    hidden={{ batchId: b.id }}
                    label="ClickPesa shows it was sent"
                    confirm="Record it as sent, with the reference ClickPesa shows."
                    confirmLabel="Record as sent"
                    tone="primary"
                  >
                    <label className={labelClass} htmlFor={`sref-${b.id}`}>
                      ClickPesa payout reference
                    </label>
                    <input id={`sref-${b.id}`} name="reference" required autoComplete="off" defaultValue={b.sendRef ?? ""} className={inputClass} />
                  </ActionForm>
                  <ActionForm
                    className="mt-3 border-t border-border/60 pt-3"
                    action={cancelPayoutAction}
                    hidden={{ batchId: b.id }}
                    label="ClickPesa shows it was NOT sent"
                    size="xs"
                    tone="danger"
                    confirm="Only if ClickPesa has no such payout, or shows it failed. What it covers becomes owed again and can be sent again — if it did go out, the partner would be paid twice."
                    confirmLabel="Yes, it was not sent"
                  >
                    <label className={labelClass} htmlFor={`swhy-${b.id}`}>
                      What does ClickPesa show?
                    </label>
                    <input id={`swhy-${b.id}`} name="reason" required maxLength={200} className={inputClass} />
                  </ActionForm>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      )}

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
                      ? `Sent ${b.paidAt ? formatWhen(b.paidAt) : ""}${b.automatic ? " automatically" : ""} · ref ${b.reference}${b.feeTZS ? ` · ClickPesa fee ${formatTZS(b.feeTZS)}` : ""}`
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
