import type { Locale } from "@/i18n/locale";
import { businessLines } from "@/lib/business";

/**
 * MalFleks's own details, as Tanzania's Electronic Transactions Act s.28 asks
 * for them: name, legal status, place of business, address, phone, email.
 *
 * A description list rather than paragraphs, so the Terms' English–Swahili
 * paragraph count (`legal-pages.test.tsx`) is unaffected by how many of the
 * fields are filled in yet. Fields that are still empty are left out rather
 * than shown blank -- see `src/lib/business.ts`.
 */
export default function BusinessDetails({ locale, className = "" }: { locale: Locale; className?: string }) {
  return (
    <dl data-testid="business-details" className={`grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr] ${className}`}>
      {businessLines(locale).map((line) => (
        <div key={line.label} className="contents">
          <dt className="text-xs uppercase tracking-wide text-muted">{line.label}</dt>
          <dd className="text-sm text-foreground">
            {line.href ? (
              <a href={line.href} className="text-accent underline decoration-border underline-offset-4">
                {line.value}
              </a>
            ) : (
              line.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
