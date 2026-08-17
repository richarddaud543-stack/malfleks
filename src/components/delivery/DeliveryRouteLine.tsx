import { formatEta } from "@/lib/format";
import { deliveryRouteLabel, type DeliveryOutlook } from "@/lib/order";

/**
 * The routing answer, shown while the customer is still choosing rather than
 * one page after they have chosen. `DeliveryBadge` says *which kind* of route
 * this is; this says who would actually carry it and how soon, which is the
 * part that changes a decision.
 *
 * Three states, and colour is never the only thing separating them — the copy
 * differs in all three, so this reads correctly under any colour-vision
 * deficiency:
 *
 *   - brand fleet    emerald — "Brand delivery" + the fleet's name
 *   - local courier  amber   — "Local agent delivery" + soonest arrival
 *   - unavailable    neutral — the blocking fact, and nothing about routing
 *
 * The pill keeps `DeliveryBadge`'s solid dark-ink fill (`bg-foreground`,
 * `#0c1e18`) rather than a translucent tint of the state colour, for the
 * reason documented there: on this white ground a /15 tint composites to a
 * near-white pastel that fails even the 3:1 non-text floor. Measured on that
 * ink (WCAG relative luminance, `(L1+0.05)/(L2+0.05)`):
 *
 *   - text-emerald-400 (#34d399): 8.99:1
 *   - text-amber-400   (#fbbf24): 10.36:1
 *   - text-zinc-200    (#e4e4e7): 13.63:1
 *
 * Zinc for the unavailable state is deliberately *not* a fourth status hue:
 * when a product cannot be ordered, the route is moot, and a neutral chip
 * says so without competing with the two states that still mean something.
 */
/**
 * `compact` is tuned for a search card, where this sits under a price in a
 * narrow column. `prominent` is for a product page, where the same 11px detail
 * line next to a 4xl heading and a 2xl price reads as an accident rather than
 * a deliberate hierarchy — checked on the rendered page, not guessed.
 */
export type DeliveryRouteLineSize = "compact" | "prominent";

const SIZES: Record<
  DeliveryRouteLineSize,
  { chip: string; detail: string; gap: string }
> = {
  compact: {
    chip: "px-2.5 py-1 text-xs",
    detail: "text-[11px]",
    gap: "gap-1",
  },
  prominent: {
    chip: "px-3 py-1.5 text-sm",
    detail: "text-sm",
    gap: "gap-1.5",
  },
};

export default function DeliveryRouteLine({
  outlook,
  size = "compact",
  className,
}: {
  outlook: DeliveryOutlook;
  size?: DeliveryRouteLineSize;
  className?: string;
}) {
  const { kind, unavailable } = outlook;
  const brandDelivered = kind === "brand";
  const scale = SIZES[size];

  const tone = unavailable
    ? "text-zinc-200"
    : brandDelivered
      ? "text-emerald-400"
      : "text-amber-400";

  const dot = unavailable
    ? "bg-zinc-200"
    : brandDelivered
      ? "bg-emerald-400"
      : "bg-amber-400";

  return (
    <div
      data-testid="delivery-route-line"
      className={`flex flex-col items-start ${scale.gap} ${className ?? ""}`}
    >
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-foreground font-medium ${scale.chip} ${tone}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {unavailable ?? deliveryRouteLabel(kind)}
      </span>

      {/* Nothing is promised about a route the customer cannot take, so the
          detail line is dropped entirely rather than greyed out. */}
      {!unavailable && (
        <span className={`leading-tight text-muted ${scale.detail}`}>
          {detailFor(outlook)}
        </span>
      )}
    </div>
  );
}

/**
 * Arrival first, carrier second: "how soon" is the part that decides between
 * two otherwise identical listings, and the courier is picked later anyway.
 * With more than one courier serving the city the count replaces the name —
 * naming only the fastest would read as if it were the only option.
 */
function detailFor({ carrier, choiceCount, eta }: DeliveryOutlook): string {
  if (!eta) return carrier ?? "";

  const soonest = formatEta(eta);
  return choiceCount > 1
    ? `${soonest} · ${choiceCount} couriers`
    : `${soonest} · ${carrier}`;
}
