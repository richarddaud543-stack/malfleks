import Link from "next/link";

import type { Locale } from "@/i18n/locale";
import { SHOP } from "@/i18n/copy/shop";

/**
 * "Verified shop": MalFleks has checked this shop's business licence, TIN
 * certificate and shop front (see `src/server/partners/verification.ts`).
 *
 * Rendered only when that is true. An unverified shop shows nothing rather
 * than a warning: while the rulebook's two weeks run, a customer has the
 * escrow, the delivery code and the 7-day return either way, and the shop's
 * products come off the shop if the documents never arrive.
 *
 * The link goes to the Terms' paragraph saying what the check is, and what it
 * is not -- a mark that promises more than its definition is the thing this
 * whole feature exists to avoid.
 */
export default function VerifiedShop({ locale, className = "" }: { locale: Locale; className?: string }) {
  const copy = SHOP[locale].product;
  return (
    <p data-testid="verified-shop" className={`flex items-start gap-2 text-sm ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-accent" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 1.5l6.5 2.6v5.1c0 4.1-2.7 7.6-6.5 9.3-3.8-1.7-6.5-5.2-6.5-9.3V4.1L10 1.5zm3.2 6.2a.75.75 0 00-1.1-1l-2.9 3.2-1.4-1.4a.75.75 0 10-1.06 1.06l2 2a.75.75 0 001.08-.03l3.38-3.83z"
          clipRule="evenodd"
        />
      </svg>
      <span>
        <Link href="/terms#partners" className="font-medium underline decoration-border underline-offset-4 hover:text-foreground">
          {copy.verifiedShop}
        </Link>
        <span className="block text-xs text-muted">{copy.verifiedShopDetail}</span>
      </span>
    </p>
  );
}
