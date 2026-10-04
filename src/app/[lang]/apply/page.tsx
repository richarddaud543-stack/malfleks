import { APPLY } from "@/i18n/copy/apply";
import { localeAlternates } from "@/i18n/locale";
import { pageLocale } from "@/i18n/server";
import type { Metadata } from "next";
import ScrollReveal from "@/components/motion/ScrollReveal";
import PartnerApplicationForm from "@/components/apply/PartnerApplicationForm";
import { getAllBrands } from "@/server/repositories";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const copy = APPLY[locale].page;
  return { title: copy.title, description: copy.description, alternates: localeAlternates(locale, "/apply") };
}

/**
 * The intake step of the partner pipeline in `docs/marketplace-model.md`.
 *
 * **This route must stay static.** A brand that cannot find the page cannot
 * apply, so it has to be indexable — which means no `requireSession()` and no
 * top-level `await cookies()` here. The sign-in gate lives inside
 * `PartnerApplicationForm`, which reads the session client-side through
 * `/api/auth/session`, exactly as the navbar does for the same reason. The
 * Server Action re-checks it, so the gate is real rather than cosmetic.
 *
 * If `npm run build` ever shows this route as `ƒ` rather than `○`, something
 * started awaiting cookies and the indexability is gone.
 */
export default async function ApplyPage({ params }: Props) {
  const copy = APPLY[await pageLocale(params)].page;
  const brands = await getAllBrands();

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="blob left-[12%] top-[-150px] h-[320px] w-[320px]"
          style={{ background: "var(--accent)", opacity: 0.16 }}
        />
        <div
          className="blob right-[8%] top-[-90px] h-[280px] w-[280px]"
          style={{
            background: "var(--lime)",
            opacity: 0.13,
            animationDelay: "-6s",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-2xl px-5 py-16">
        <ScrollReveal>
          <p className="font-accent-serif text-xl italic text-accent">
            {copy.eyebrow}
          </p>
          <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
            {copy.heading}
          </h1>
          <p className="mt-3 text-muted">
            {copy.intro}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.08}>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {copy.steps.map((step, index) => ({ ...step, n: String(index + 1) })).map((step) => (
              <li
                key={step.n}
                className="rounded-2xl border border-border bg-surface-2 p-5"
              >
                <span className="font-mono text-xs tracking-widest text-accent">
                  {copy.step(step.n)}
                </span>
                <h2 className="font-display mt-2 text-base font-medium">
                  {step.title}
                </h2>
                <p className="mt-1.5 text-sm text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </ScrollReveal>

        <ScrollReveal delay={0.16}>
          <PartnerApplicationForm
            brands={brands.map((brand) => ({ id: brand.id, name: brand.name }))}
          />
        </ScrollReveal>

        {/* What actually happens next. Since 3 Oct 2026 an applicant is
            emailed the decision (`notifyApplicationDecision`), so this no
            longer has to warn that nothing will arrive. */}
        <ScrollReveal delay={0.24}>
          <p className="mt-8 text-xs text-muted">
            {copy.footnote}
          </p>
        </ScrollReveal>
      </div>
    </div>
  );
}
