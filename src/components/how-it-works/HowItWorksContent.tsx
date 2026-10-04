import Link from "next/link";

import SafePay from "@/components/trust/SafePay";
import type { Step } from "@/lib/how-it-works";
import { serializeJsonLd } from "@/lib/product-json-ld";
import type { Locale } from "@/i18n/locale";
import { SITE_COPY } from "@/lib/site-copy";
import { buildFaqJsonLd } from "@/lib/site-json-ld";

/**
 * "How MalFleks works", and the questions people ask before they pay -- in
 * English (`/how-it-works`) or in Swahili (`/sw/how-it-works`).
 *
 * This page exists because the promise had nowhere to be explained. It sat on
 * the home, product, order and pay pages as three short lines with a link to
 * the Terms -- a legal page -- and that was the whole public account of what
 * MalFleks does. Someone deciding whether to trust a new site with their
 * money, a search engine, or an AI assistant asked "is MalFleks safe?" had
 * nothing plain to read.
 *
 * The words live in `how-it-works.ts` (English) and `site-copy.ts` (both
 * languages, side by side); see the notes there on what they are held to.
 * The questions are also given to search engines as structured data, word
 * for word, in the language of the page.
 */
export default function HowItWorksContent({ locale }: { locale: Locale }) {
  const page = SITE_COPY[locale].howItWorks;

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildFaqJsonLd(page.questions.items, locale)) }}
      />

      <p className="font-accent-serif text-xl italic text-accent">{page.eyebrow}</p>
      <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">{page.title}</h1>
      <p className="mt-4 max-w-prose text-lg text-muted">{page.lead}</p>

      <div className="mt-8">
        <SafePay locale={locale} />
      </div>

      <Steps id="buying" label={page.stepLabel} {...page.buying} />

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/search" className="btn-pill btn-lime px-6 py-2.5 text-sm">
          {page.actions.search}
        </Link>
        <Link href="/locator" className="btn-pill btn-outline px-6 py-2.5 text-sm">
          {page.actions.locator}
        </Link>
      </div>

      <section aria-labelledby="questions-heading" className="mt-16">
        <h2 id="questions-heading" className="font-display text-2xl font-medium tracking-tight">
          {page.questions.heading}
        </h2>
        <dl className="mt-6 divide-y divide-border border-y border-border">
          {page.questions.items.map((item) => (
            <div key={item.question} className="py-5">
              <dt className="font-display text-lg font-medium text-foreground">{item.question}</dt>
              <dd className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
                {item.answer}
                {item.link && (
                  <>
                    {" "}
                    <Link href={item.link.href} className="text-accent underline decoration-border underline-offset-4">
                      {item.link.label}
                    </Link>
                    .
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <Steps id="selling" label={page.stepLabel} {...page.selling} />
      <Steps id="delivering" label={page.stepLabel} {...page.delivering} />

      <div className="mt-8">
        <Link href="/apply" className="btn-pill btn-ink px-6 py-2.5 text-sm">
          {page.apply}
        </Link>
      </div>

      <p className="mt-16 text-sm text-muted">
        {page.footnote.before}
        <Link href="/terms" className="text-accent underline decoration-border underline-offset-4">
          {page.footnote.terms}
        </Link>
        {page.footnote.between}
        <Link href="/privacy" className="text-accent underline decoration-border underline-offset-4">
          {page.footnote.privacy}
        </Link>
        {page.footnote.after}
      </p>
    </div>
  );
}

function Steps({
  id,
  heading,
  intro,
  steps,
  label,
}: {
  id: string;
  heading: string;
  intro: string;
  steps: readonly Step[];
  label: (n: number) => string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="mt-16 scroll-mt-28">
      <h2 id={`${id}-heading`} className="font-display text-2xl font-medium tracking-tight">
        {heading}
      </h2>
      <p className="mt-2 max-w-prose text-muted">{intro}</p>
      <ol className="mt-6 grid gap-3 sm:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step.title} className="glass-card rounded-2xl p-5">
            <p className="font-mono text-xs tracking-widest text-accent">{label(index + 1)}</p>
            <h3 className="mt-2 font-display text-lg font-medium">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
