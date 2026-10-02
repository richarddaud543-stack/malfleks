import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { accruePayoutsAction, recordRefundAction } from "@/app/actions/admin-console";
import ActionForm from "@/components/admin/ActionForm";
import { CheckPaymentButton } from "@/components/admin/CheckPaymentButtons";
import OrderActions from "@/components/admin/OrderActions";
import { Badge, Card, Facts, inputClass, labelClass, Notice, PageHeader, placeLabel } from "@/components/admin/ui";
import OrderTrackingMap from "@/components/locator/OrderTrackingMap";
import { ageLabel, formatTZS, formatWhen } from "@/lib/charts";
import { formatPhone } from "@/lib/order";
import { getOrderDetail, type TimelineItem } from "@/server/admin/orders";
import { requireAdmin } from "@/server/auth/dal";

export const metadata: Metadata = {
  title: "Order",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAYMENT_LABEL: Record<string, string> = { captured: "paid", pending: "link sent", failed: "payment failed" };
const KIND_LABEL: Record<string, string> = {
  branch_payout: "Owed to the branch",
  courier_payout: "Owed to the courier",
  malfleks_fee: "MalFleks fees",
  refund: "Refunded to the customer",
  reversal: "Reversal",
};

/**
 * One order, everything about it on one page: who to call, what was ordered
 * and at what price, where the money is, and everything that has happened
 * to it in order. The status controls are the same ones the old order card
 * had, unchanged.
 */
export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/orders/${id}`);

  const detail = await getOrderDetail(id);
  if (!detail) notFound();

  const { order, money, timeline, latestPayment, captured, lastPing, branchPartner, courierPartner } = detail;
  const now = new Date();
  const paymentForActions = captured ?? latestPayment;
  const goodsOnly = order.quoteOrderTotalTZS == null;
  const heldForOrder = money.collectedTZS - money.refundedTZS;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ href: "/admin/orders", label: "Orders" }}
        eyebrow={
          <>
            <span className="font-mono">{order.reference}</span>
            <Badge status={order.status} />
            {paymentForActions && <Badge status={paymentForActions.status} label={PAYMENT_LABEL[paymentForActions.status]} />}
            <span>placed {formatWhen(order.createdAt)}</span>
          </>
        }
        title={
          <>
            {order.productName} <span className="text-muted">× {order.quantity}</span>
          </>
        }
        description={`${order.brandName} · ${placeLabel(order.branchName, order.branchCity)}`}
      />

      {order.status === "cancelled" && money.refundableTZS > 0 && (
        <Notice tone="danger">
          <strong>Cancelled, but MalFleks still holds {formatTZS(money.refundableTZS)} of the customer&apos;s money.</strong>{" "}
          Send the refund from ClickPesa, then record it below so the books match.
        </Notice>
      )}
      {order.status === "fulfilled" && captured && !money.split && (
        <Notice tone="warn">
          <strong>Delivered and paid, but the payouts haven&apos;t been worked out.</strong> Use &ldquo;Work out payouts&rdquo; in
          Money, and it will say why if it can&apos;t.
        </Notice>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {(order.status === "pending" || order.status === "confirmed") && (
            <Card className="p-4">
              <h2 className="text-sm font-semibold">Next step</h2>
              <p className="mt-1 text-sm text-muted">
                {order.status === "pending"
                  ? "Ring the branch: is it in stock at this price? Then confirm — that opens the customer's checkout and emails them the link — or cancel with the reason."
                  : captured
                    ? "Paid. Once it is delivered, mark it fulfilled — the branch or courier can also do that themselves."
                    : latestPayment
                      ? `Confirmed, and the customer's checkout is open${order.customerEmail ? " (they were emailed the link)" : " (no email on file — they'll find it on their account page)"}. Waiting for them to pay.`
                      : "Confirmed, but no payment link exists yet. It is made when the customer opens their checkout, or use “Send payment link”."}
              </p>
              <OrderActions
                order={{
                  id: order.id,
                  reference: order.reference,
                  status: order.status,
                  payment: paymentForActions ? { status: paymentForActions.status, checkoutLink: paymentForActions.checkoutLink } : null,
                }}
              />
            </Card>
          )}

          <Card className="p-4">
            <h2 className="text-sm font-semibold">Customer</h2>
            <div className="mt-3">
              <Facts
                items={[
                  { label: "Name", value: order.customerFullName },
                  {
                    label: "Phone",
                    value: (
                      <a href={`tel:${order.customerPhone}`} className="font-mono text-accent hover:underline">
                        {formatPhone(order.customerPhone)}
                      </a>
                    ),
                  },
                  { label: "Delivery address", value: order.customerAddress, wide: true },
                  {
                    label: "Account",
                    value: order.customerId ? (order.customerEmail ?? "Signed in when ordering") : "Not signed in",
                  },
                  { label: "Sent at (their phone's clock)", value: formatWhen(order.requestedAt) },
                ]}
              />
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold">What was ordered</h2>
            <div className="mt-3">
              <Facts
                items={[
                  {
                    label: "Product",
                    value: order.product ? (
                      <Link href={`/admin/catalogue?q=${encodeURIComponent(order.product.slug)}`} className="text-accent hover:underline">
                        {order.productName}
                      </Link>
                    ) : (
                      <>
                        {order.productName} <span className="text-xs text-muted">(no longer listed)</span>
                      </>
                    ),
                  },
                  { label: "Unit price when ordered", value: formatTZS(order.unitPriceTZS) },
                  {
                    label: "Branch",
                    value: (
                      <>
                        {placeLabel(order.branchName, order.branchCity)}
                        <span className="block text-xs">
                          {order.branchPhone && (
                            <a href={`tel:${order.branchPhone}`} className="mr-3 font-mono text-accent hover:underline">
                              {order.branchPhone}
                            </a>
                          )}
                          {branchPartner && (
                            <Link href={`/admin/partners/${branchPartner.id}`} className="text-accent hover:underline">
                              Partner page →
                            </Link>
                          )}
                        </span>
                      </>
                    ),
                  },
                  {
                    label: "Delivery",
                    value: (
                      <>
                        {order.routeKind === "agent" ? "Courier: " : "Brand's own fleet: "}
                        {order.routeCarrier}
                        <span className="block text-xs">
                          {order.routeAgentPhone && (
                            <a href={`tel:${order.routeAgentPhone}`} className="mr-3 font-mono text-accent hover:underline">
                              {formatPhone(order.routeAgentPhone)}
                            </a>
                          )}
                          {courierPartner && (
                            <Link href={`/admin/partners/${courierPartner.id}`} className="text-accent hover:underline">
                              Partner page →
                            </Link>
                          )}
                        </span>
                        {order.routeEtaEstimate && <span className="block text-xs text-muted">{order.routeEtaEstimate}</span>}
                      </>
                    ),
                  },
                  ...(order.decisionNote
                    ? [{ label: order.status === "cancelled" ? "Why it was cancelled" : "Note", value: order.decisionNote, wide: true }]
                    : []),
                ]}
              />
            </div>

            <h3 className="mt-5 text-xs font-medium text-muted">The price, as quoted when ordered</h3>
            <table className="mt-1.5 w-full text-sm">
              <tbody className="tabular-nums">
                <QuoteRow label={`Goods (${order.quantity} × ${formatTZS(order.unitPriceTZS)})`} value={order.lineTotalTZS} />
                {!goodsOnly && order.routeKind === "agent" && <QuoteRow label="Delivery fee" value={order.quoteDeliveryFeeTZS ?? 0} />}
                <QuoteRow label="Customer pays" value={order.quoteOrderTotalTZS ?? order.lineTotalTZS} strong />
                {!goodsOnly && (
                  <>
                    <QuoteRow label="of which MalFleks's goods fee" value={order.quoteGoodsRungTZS ?? 0} muted />
                    {(order.quoteDeliveryRungTZS ?? 0) > 0 && (
                      <QuoteRow label="of which MalFleks's delivery fee" value={order.quoteDeliveryRungTZS ?? 0} muted />
                    )}
                  </>
                )}
              </tbody>
            </table>
            {goodsOnly && (
              <p className="mt-2 text-xs text-muted">
                No delivery fee is set for {order.branchCity} yet, so this order has no full quote and can&apos;t be sent a payment link.
              </p>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold">History</h2>
            <ol className="mt-3 flex flex-col">
              {timeline.map((item, i) => (
                <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                  <span aria-hidden="true" className="relative mt-1.5 flex w-2 justify-center">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    {i < timeline.length - 1 && <span className="absolute top-3 h-[calc(100%+0.25rem)] w-px bg-border" />}
                  </span>
                  <div className="min-w-0 text-sm">
                    <p>{describeEvent(item)}</p>
                    <p className="text-xs text-muted">
                      <time dateTime={item.at.toISOString()}>{formatWhen(item.at)}</time> · {ageLabel(item.at, now)} ago
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            {order.events.length === 0 && order.createdAt < new Date("2026-08-27") && (
              <p className="mt-3 text-xs text-muted">Placed before status history was recorded, so earlier steps aren&apos;t shown.</p>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Money</h2>
            {order.payments.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                No payment asked for yet.
                {order.status === "confirmed" && " One is made when the customer opens their checkout."}
              </p>
            ) : (
              <>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Collected</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums">{formatTZS(money.collectedTZS)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{money.split ? "Still to pay partners" : "Held by MalFleks"}</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                      {formatTZS(
                        money.split
                          ? money.payouts.filter((p) => p.batchStatus !== "paid").reduce((s, p) => s + p.amountTZS, 0)
                          : heldForOrder,
                      )}
                    </dd>
                  </div>
                  {money.refundedTZS > 0 && (
                    <div>
                      <dt className="text-xs text-muted">Refunded</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums">{formatTZS(money.refundedTZS)}</dd>
                    </div>
                  )}
                </dl>

                <ul className="mt-4 flex flex-col gap-2">
                  {order.payments
                    .slice()
                    .reverse()
                    .map((p) => (
                      <li key={p.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="tabular-nums">{formatTZS(p.amountTZS)}</span>
                          <Badge status={p.status} label={PAYMENT_LABEL[p.status]} />
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          Link created {ageLabel(p.initiatedAt, now)} ago
                          {p.providerStatus && ` · ClickPesa: ${p.providerStatus.replaceAll("_", " ").toLowerCase()}`}
                          {p.lastCheckedAt && ` (checked ${ageLabel(p.lastCheckedAt, now)} ago)`}
                        </p>
                        {p.status === "captured" && <p className="text-xs text-muted">Reference {p.providerRef}</p>}
                        {p.failureNote && <p className="text-xs text-muted">{p.failureNote}</p>}
                        {p.status !== "captured" && !captured && (
                          <div className="mt-2">
                            <CheckPaymentButton paymentId={p.id} />
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
              </>
            )}

            {money.split && (
              <div className="mt-4 border-t border-border pt-3">
                <h3 className="text-xs font-medium text-muted">Who gets what</h3>
                <table className="mt-1.5 w-full text-sm">
                  <tbody className="tabular-nums">
                    {money.payouts.map((p, i) => (
                      <tr key={i}>
                        <td className="py-1">{KIND_LABEL[p.kind]}</td>
                        <td className="py-1 text-right">{formatTZS(p.amountTZS)}</td>
                        <td className="py-1 pl-2 text-right">
                          {p.batchStatus === "paid" ? (
                            <Badge status="paid" label="sent" />
                          ) : p.batchStatus === "pending" ? (
                            <Link href="/admin/payouts" className="text-xs text-accent hover:underline">
                              in a payout
                            </Link>
                          ) : (
                            <Link href="/admin/payouts" className="text-xs text-accent hover:underline">
                              owed
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="text-muted">
                      <td className="py-1">{KIND_LABEL.malfleks_fee}</td>
                      <td className="py-1 text-right">{formatTZS(money.feeTZS)}</td>
                      <td className="py-1 pl-2 text-right text-xs">kept</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {order.status === "fulfilled" && captured && !money.split && (
              <ActionForm
                className="mt-4 border-t border-border pt-3"
                action={accruePayoutsAction}
                hidden={{ orderId: order.id }}
                label="Work out payouts"
                pendingLabel="Working out…"
                tone="primary"
              />
            )}

            {order.status === "cancelled" && money.refundableTZS > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <h3 className="text-xs font-medium text-muted">Record a refund you&apos;ve sent</h3>
                <p className="mt-1 text-xs text-muted">
                  This only records it — send the money first, from the ClickPesa dashboard (Payout) to {formatPhone(order.customerPhone)}.
                </p>
                <ActionForm
                  className="mt-2"
                  action={recordRefundAction}
                  hidden={{ orderId: order.id }}
                  label="Record refund"
                  confirm="Record this refund? It can't be edited afterwards."
                  confirmLabel="Yes, record it"
                  tone="primary"
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className={labelClass} htmlFor="refund-amount">
                        Amount (TSh)
                      </label>
                      <input
                        id="refund-amount"
                        name="amount"
                        inputMode="numeric"
                        required
                        defaultValue={String(money.refundableTZS)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="refund-reference">
                        ClickPesa reference
                      </label>
                      <input id="refund-reference" name="reference" required autoComplete="off" className={inputClass} />
                    </div>
                  </div>
                </ActionForm>
              </div>
            )}
          </Card>

          {lastPing && (
            <Card className="p-4">
              <h2 className="text-sm font-semibold">Last reported position</h2>
              <p className="mt-1 text-xs text-muted">
                {ageLabel(lastPing.createdAt, now)} ago{lastPing.note ? ` · ${lastPing.note}` : ""}
              </p>
              <div className="mt-2 max-w-[260px] overflow-hidden rounded-lg border border-border">
                <OrderTrackingMap position={{ lat: lastPing.latitude, lng: lastPing.longitude }} />
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function QuoteRow({ label, value, strong, muted }: { label: string; value: number; strong?: boolean; muted?: boolean }) {
  return (
    <tr className={`${strong ? "border-t border-border font-semibold" : ""} ${muted ? "text-xs text-muted" : ""}`}>
      <td className="py-1">{label}</td>
      <td className="py-1 text-right">{formatTZS(value)}</td>
    </tr>
  );
}

const STATUS_WORDS: Record<string, string> = {
  confirmed: "Confirmed with the branch",
  fulfilled: "Marked delivered",
  cancelled: "Cancelled",
};

/**
 * The same three moves when a partner made them. A branch answering its own
 * order is a different fact from an admin phoning to ask, and the history
 * should say which it was.
 */
const PARTNER_STATUS_WORDS: Record<"branch" | "courier", Record<string, string>> = {
  branch: {
    confirmed: "Confirmed by the branch",
    fulfilled: "Marked delivered by the branch",
    cancelled: "Declined by the branch",
  },
  courier: {
    fulfilled: "Marked delivered by the courier",
  },
};

function statusWords(item: Extract<TimelineItem, { type: "status" }>): string {
  // Paying is what confirms an order now; nobody pressed anything.
  if (item.by === "payment" && item.to === "confirmed") return "Confirmed automatically when the customer paid";
  const byPartner = item.by === "branch" || item.by === "courier" ? PARTNER_STATUS_WORDS[item.by][item.to] : undefined;
  return byPartner ?? STATUS_WORDS[item.to] ?? `Moved to ${item.to}`;
}

function describeEvent(item: TimelineItem): string {
  switch (item.type) {
    case "created":
      return "Order placed";
    case "status":
      return `${statusWords(item)}${item.note ? ` — “${item.note}”` : ""}`;
    case "payment-link":
      return `Payment link created for ${formatTZS(item.amountTZS)}`;
    case "payment-captured":
      return `Paid: ${formatTZS(item.amountTZS)} received (ClickPesa ${item.reference})`;
    case "payment-failed":
      return `A payment attempt failed${item.note ? ` — ${item.note}` : ""}`;
    case "ping":
      return `Position reported${item.note ? ` — ${item.note}` : ""}`;
    case "ledger":
      return `${KIND_LABEL[item.kind] ?? item.kind}: ${formatTZS(item.amountTZS)}`;
  }
}
