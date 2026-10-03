import Link from "next/link";
import { PROMISE } from "@/lib/promise";

/**
 * The promise, on the light pages: product, order and pay.
 *
 * These pages already said it — in 12px grey under a button. A buyer deciding
 * whether to send money to a site they have never used does not read 12px
 * grey, so the same commitment gets a heading, a mark and its own card.
 *
 * `compact` drops the three points for places where the space belongs to
 * something else (the pay page's order summary); the headline, the Swahili
 * line and the link to the terms always stay.
 */
export default function SafePay({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="safe-pay-heading"
      data-testid="safe-pay"
      className={`rounded-2xl border border-border bg-surface-2 p-5 sm:p-6 ${className}`}
    >
      <div className="flex items-start gap-3">
        <ShieldMark />
        <div>
          <h2 id="safe-pay-heading" className="font-display text-base font-medium leading-snug">
            {PROMISE.headline}
          </h2>
          <p lang="sw" className="mt-1 text-sm text-muted">
            {PROMISE.swahili}
          </p>
        </div>
      </div>

      {!compact && (
        <ul className="mt-4 space-y-3 text-sm">
          {PROMISE.points.map((point) => (
            <li key={point.title}>
              <span className="font-medium">{point.title}.</span>{" "}
              <span className="text-muted">{point.body}</span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={PROMISE.link.href}
        className="mt-4 inline-block text-sm underline underline-offset-4 hover:text-foreground"
      >
        {PROMISE.link.label}
      </Link>
    </section>
  );
}

/** A shield with a tick. Decorative: the heading beside it carries the meaning. */
export function ShieldMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className="mt-0.5 shrink-0"
    >
      <path
        d="M16 3l11 4v8c0 7-4.6 12-11 14C9.6 27 5 22 5 15V7l11-4z"
        fill="var(--lime, #9eb60f)"
      />
      <path
        d="M10.5 16l4 4 7-8"
        fill="none"
        stroke="#0c1e18"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
