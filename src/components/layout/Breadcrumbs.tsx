import Link from "next/link";

export interface Crumb {
  label: string;
  /** Omit on the last crumb: the page you are on is not a link to itself. */
  href?: string;
}

/**
 * Where this page sits, and a way up to every level above it.
 *
 * Until 3 Oct 2026 each page had a single "← parent" link, so a product
 * reached from search could step back to its branch and no further, and a
 * brand page had no way back to the brand list at all. Shoppers who land deep
 * (from a shared link, a search engine, a WhatsApp message) need the whole
 * path, not one rung of it.
 *
 * The same trail is published as schema.org `BreadcrumbList`, which is what
 * lets a search result show "Brands › Toyota › Dar es Salaam" instead of a
 * bare URL. `siteUrl` is passed in rather than resolved here so this stays a
 * plain component any page can render.
 *
 * Links are at least 44px tall: on a phone a row of small text links is the
 * easiest thing on the page to miss with a thumb.
 */
export default function Breadcrumbs({ trail, siteUrl }: { trail: Crumb[]; siteUrl?: string }) {
  const structured =
    siteUrl && trail.length > 1
      ? {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: trail.map((crumb, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: crumb.label,
            ...(crumb.href ? { item: `${siteUrl}${crumb.href}` } : {}),
          })),
        }
      : null;

  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-x-1.5">
        {trail.map((crumb, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={`${crumb.label}-${i}`} className="flex items-center gap-x-1.5">
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className="inline-flex min-h-11 items-center underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="inline-flex min-h-11 items-center text-foreground">
                  {crumb.label}
                </span>
              )}
              {!last && (
                <span aria-hidden="true" className="text-muted/60">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {structured && (
        <script
          type="application/ld+json"
          // `<` escaped so a product or branch name can never close the tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }}
        />
      )}
    </nav>
  );
}
