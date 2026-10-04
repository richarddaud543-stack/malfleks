import { ShieldMark } from "@/components/trust/SafePay";
import type { Locale } from "@/i18n/locale";
import { SITE_COPY } from "@/lib/site-copy";

/**
 * Where the buyer's money is at each moment, drawn as three stops on a line.
 *
 * This is the picture in the home page's first screen. It is there instead of
 * a photograph because it *is* the product: the one thing MalFleks does that
 * a chat with a stranger does not is hold the money in the middle. A buyer
 * should be able to see that before reading a sentence.
 *
 * Three stops and no more, each restating one of the commitments in
 * `promise.ts` -- nothing is said here that the Terms do not say. The words
 * are in `site-copy.ts`; the middle stop is the one where the money is held.
 */
/** Which of the three stops is the one where MalFleks is holding the money. */
const HELD_STOP = 1;

export default function MoneyPath({ locale = "en" }: { locale?: Locale }) {
  const { caption, stops, refund } = SITE_COPY[locale].moneyPath;

  return (
    <figure className="rounded-[1.75rem] border border-border bg-surface p-6 sm:p-8">
      <figcaption className="sr-only">{caption}</figcaption>
      <ol className="relative">
        {/* The line the three stops sit on. */}
        <span aria-hidden="true" className="absolute bottom-6 left-[1.125rem] top-6 w-px bg-accent/25" />
        {stops.map((stop, index) => (
          <li key={stop.title} className="relative flex gap-4 pb-7 last:pb-0">
            <span
              aria-hidden="true"
              className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                index === HELD_STOP ? "bg-foreground text-background" : "border border-accent/40 bg-background text-accent"
              }`}
            >
              {index === HELD_STOP ? <ShieldMark size={18} /> : index + 1}
            </span>
            <div className="pt-1">
              <p className="font-display text-lg font-medium leading-snug">{stop.title}</p>
              <p className="mt-1 text-sm text-muted">{stop.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 border-t border-accent/15 pt-4 text-sm text-muted">
        {refund}
      </p>
    </figure>
  );
}
