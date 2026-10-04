import type { Locale } from "@/i18n/locale";
import { deliveryRouteLabel } from "@/lib/order";

/**
 * The product's core delivery signal: emerald for brand-fleet delivery,
 * amber for local courier. Those two shades (emerald/amber-400) were chosen
 * against the old near-black ground, where a translucent /15 tint fill still
 * read as a dark, saturated chip. On white that same tint composites to a
 * near-white pastel (e.g. emerald-500/15 over white ≈ #dbf5ec), and
 * emerald-400 text on it measures 1.67:1 — amber the same shape at 1.49:1.
 * Both fail even the 3:1 floor for non-text UI, let alone 4.5:1 for text.
 *
 * Fix: keep the exact colour identity (still emerald-400 / amber-400, so the
 * two states stay unambiguous to anyone who already reads this app) but
 * flip the chip itself to a solid dark-ink fill (`bg-foreground`,
 * `#0c1e18`) rather than a translucent tint of the state colour. This is
 * the same island-of-dark pattern `BrandCard`'s delivery-mix pill already
 * uses on this ground — measured (WCAG relative-luminance contrast,
 * `sRGB -> linear -> 0.2126/0.7152/0.0722` weights, `(L1+0.05)/(L2+0.05)`):
 *   - text-emerald-400 (#34d399) on #0c1e18: 8.99:1  (needs 4.5:1 as text)
 *   - text-amber-400  (#fbbf24) on #0c1e18: 10.36:1 (needs 4.5:1 as text)
 * The dot reuses the same colour/background pair, so the same ratios cover
 * it as non-text UI (needs 3:1) with wide margin.
 *
 * Colour is never the only signal either way: the two states also carry
 * distinct copy ("Brand delivery" vs "Local agent delivery"), so this reads
 * correctly under any color-vision deficiency, not just for typical vision.
 */
export default function DeliveryBadge({
  deliveryOffered,
  className,
  locale = "en",
}: {
  deliveryOffered: boolean;
  className?: string;
  locale?: Locale;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-foreground px-2.5 py-1 text-xs font-medium ${
        deliveryOffered ? "text-emerald-400" : "text-amber-400"
      } ${className ?? ""}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          deliveryOffered ? "bg-emerald-400" : "bg-amber-400"
        }`}
      />
      {deliveryRouteLabel(deliveryOffered ? "brand" : "agent", locale)}
    </span>
  );
}
