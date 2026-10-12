import { CONTACT } from "@/i18n/copy/apply";
import { localeAlternates } from "@/i18n/locale";
import { pageLocale } from "@/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";

import ScrollReveal from "@/components/motion/ScrollReveal";
import BusinessDetails from "@/components/legal/BusinessDetails";
import { MALFLEKS_CONTACT_EMAIL } from "@/lib/contact";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const copy = CONTACT[locale];
  return { title: copy.title, description: copy.description, alternates: localeAlternates(locale, "/contact") };
}

/**
 * Contact.
 *
 * One address, no form. A contact form would need a mailbox behind it and a
 * reply path, and until both exist a form is a suggestion box that silently
 * drops what it is given — the same failure as a phone number that rings
 * nowhere. When notifications are wired and answered, a form can be added.
 *
 * The page also says how long a reply takes, in words that will still be true
 * on a bad week. "Within 24 hours" from a one-person operation is a promise
 * broken the first time someone travels.
 */
export default async function ContactPage({ params }: Props) {
  const locale = await pageLocale(params);
  const copy = CONTACT[locale];
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <ScrollReveal>
        <p className="font-accent-serif text-xl italic text-accent">MalFleks</p>
        <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
          {copy.heading}
        </h1>
        <p className="mt-4 max-w-prose text-muted">
          {copy.intro}
        </p>
      </ScrollReveal>

      <div className="glass-card mt-10 rounded-2xl px-6 py-8 text-center">
        <p className="text-sm text-muted">{copy.email}</p>
        <a
          href={`mailto:${MALFLEKS_CONTACT_EMAIL}`}
          className="mt-1 block break-words font-display text-xl font-medium text-accent underline decoration-border underline-offset-4"
        >
          {MALFLEKS_CONTACT_EMAIL}
        </a>
        <p className="mx-auto mt-4 max-w-sm text-xs text-muted">
          {copy.aim}
        </p>
      </div>

      <div className="mt-12 space-y-8 text-sm leading-relaxed text-muted">
        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            {copy.orderHeading}
          </h2>
          <p className="mt-2">
            {copy.orderBody}
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            {copy.listingHeading}
          </h2>
          <p className="mt-2">
            {copy.listing.before}
            <Link
              href="/apply"
              className="text-accent underline decoration-border underline-offset-4"
            >
              {copy.listing.link}
            </Link>
            {copy.listing.after}
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            {copy.wrongHeading}
          </h2>
          <p className="mt-2">
            {copy.wrongBody}
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            {copy.dataHeading}
          </h2>
          <p className="mt-2">
            {copy.data.before}
            <Link
              href="/privacy"
              className="text-accent underline decoration-border underline-offset-4"
            >
              {copy.data.link}
            </Link>
            {copy.data.after}
          </p>
        </section>

        {/* Electronic Transactions Act 2015, s.28: who is behind the site. */}
        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            {copy.whoHeading}
          </h2>
          <BusinessDetails locale={locale} className="mt-3" />
        </section>
      </div>
    </div>
  );
}
