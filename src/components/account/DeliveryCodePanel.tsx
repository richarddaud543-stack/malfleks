import { ACCOUNT } from "@/i18n/copy/account";
import type { Locale } from "@/i18n/locale";

/**
 * The customer's delivery code, on their own order.
 *
 * Shown large and spaced in two groups of three, because it is read aloud at
 * a door: "four eight two, nine one three". `aria-label` gives a screen reader
 * the digits one at a time instead of "four hundred and eighty-two thousand".
 *
 * A server component with nothing interactive in it. The page only passes a
 * code it read for the signed-in customer's own order.
 */
export default function DeliveryCodePanel({ code, locale = "en" }: { code: string; locale?: Locale }) {
  const copy = ACCOUNT[locale].card.code;
  const grouped = `${code.slice(0, 3)} ${code.slice(3)}`;
  return (
    <div data-testid="delivery-code" className="mt-4 rounded-xl border border-accent/50 bg-accent/5 px-4 py-4">
      <p className="text-xs uppercase tracking-wide text-muted">{copy.label}</p>
      <p aria-label={code.split("").join(" ")} className="mt-1 font-mono text-3xl font-medium tracking-[0.2em] tabular-nums">
        {grouped}
      </p>
      <p className="mt-3 text-sm">{copy.how}</p>
      <p className="mt-1 text-xs text-muted">{copy.never}</p>
    </div>
  );
}
