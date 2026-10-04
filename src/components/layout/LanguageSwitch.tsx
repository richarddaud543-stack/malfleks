import Link from "next/link";

import { otherLocale, PAGE_PATHS, SITE_COPY, type Locale } from "@/lib/site-copy";

/**
 * The link from a page to the same page in the other language.
 *
 * Shown only on the pages that exist in both (`PAGE_PATHS`), and named in the
 * language it leads to -- "Kiswahili" on the English page, "English" on the
 * Swahili one -- because that is the word its reader is looking for.
 */
export default function LanguageSwitch({
  locale,
  page,
  className = "",
}: {
  locale: Locale;
  page: keyof typeof PAGE_PATHS;
  className?: string;
}) {
  const other = otherLocale(locale);
  const copy = SITE_COPY[other];
  return (
    <Link
      href={PAGE_PATHS[page][other]}
      hrefLang={other}
      lang={other}
      aria-label={copy.switchLabel}
      data-testid="language-switch"
      className={`inline-flex min-h-9 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent ${className}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--lime)]" />
      {copy.languageName}
    </Link>
  );
}
