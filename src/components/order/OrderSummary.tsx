import { carrierLabel, ORDER } from "@/i18n/copy/order";
import type { Locale } from "@/i18n/locale";
import { formatTZS } from "@/lib/format";
import { deliveryRouteLabel, type DeliveryRouteKind } from "@/lib/order";

export interface OrderSummaryProps {
  product: { name: string; unitPriceTZS: number };
  /** `null` while the customer is still editing the quantity field. */
  quantity: number | null;
  lineTotalTZS: number | null;
  route: {
    kind: DeliveryRouteKind;
    /** `null` until an agent is picked on an agent route. */
    carrier: string | null;
    etaEstimate?: string;
  };
  branch: { name: string; city: string };
  /** Brand accent, used for the card's glow. */
  tint?: string;
  /** The language of the labels. The form and the confirmation screen pass theirs. */
  locale?: Locale;
}

/**
 * The same summary on both steps of the flow: what is being ordered, what it
 * costs, and — the part that matters — who is carrying it and from where.
 */
export default function OrderSummary({
  product,
  quantity,
  lineTotalTZS,
  route,
  branch,
  tint,
  locale = "en",
}: OrderSummaryProps) {
  const copy = ORDER[locale].summary;
  const brandDelivered = route.kind === "brand";

  return (
    <div
      className="glass-card tint-glow rounded-2xl p-6"
      style={tint ? ({ "--tint": tint } as React.CSSProperties) : undefined}
    >
      <h3 className="font-display text-lg font-medium">{copy.heading}</h3>

      <dl className="mt-5 space-y-3 text-sm">
        <Row label={copy.item}>{product.name}</Row>
        <Row label={copy.unitPrice}>{formatTZS(product.unitPriceTZS)}</Row>
        <Row label={copy.quantity}>{quantity ?? "—"}</Row>
        <Row label={copy.from}>
          {branch.name}
          <span className="block text-muted">{branch.city}</span>
        </Row>
        <Row label={copy.delivery}>
          <span
            className={brandDelivered ? "text-accent" : "text-accent-3"}
          >
            {deliveryRouteLabel(route.kind, locale)}
          </span>
          <span className="block text-muted">
            {route.carrier ? carrierLabel(route.carrier, locale) : copy.notChosen}
            {route.etaEstimate ? ` · ${route.etaEstimate}` : ""}
          </span>
        </Row>

        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-4">
          <dt className="font-medium">{copy.total}</dt>
          <dd
            data-testid="order-line-total"
            className="font-display text-xl font-medium"
          >
            {lineTotalTZS === null ? "—" : formatTZS(lineTotalTZS)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-muted">
        {brandDelivered
          ? copy.branchDelivers
          : copy.feeAdded}{" "}
        {copy.nothingAtDoor}
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
