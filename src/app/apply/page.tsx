import type { Metadata } from "next";
import ScrollReveal from "@/components/motion/ScrollReveal";
import PartnerApplicationForm from "@/components/apply/PartnerApplicationForm";
import { getAllBrands } from "@/server/repositories";

export const metadata: Metadata = {
  title: "Become a partner",
  description:
    "Apply to sell through MalFleks as a brand branch, or to carry deliveries as a local courier in Dar es Salaam, Arusha, Mwanza or Dodoma.",
};

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
export default async function ApplyPage() {
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
            background: "var(--accent-2)",
            opacity: 0.13,
            animationDelay: "-6s",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-2xl px-5 py-16">
        <ScrollReveal>
          <p className="font-accent-serif text-xl italic text-accent">
            Sell or deliver with us
          </p>
          <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
            Become a MalFleks partner
          </h1>
          <p className="mt-3 text-muted">
            MalFleks connects real shops in Tanzania to customers, and gets the goods
            there — either on the brand&apos;s own van, or with a local courier.
            If you run a branch or carry deliveries, this is where you start.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.08}>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              {
                n: "1",
                title: "You apply",
                body: "A few details about your branch or your courier business. It takes a minute.",
              },
              {
                n: "2",
                title: "We check it by hand",
                body: "Someone at MalFleks reads every application. Nothing is approved automatically.",
              },
              {
                n: "3",
                title: "You're set up",
                body: "Approved partners get access to list products or receive delivery jobs.",
              },
            ].map((step) => (
              <li
                key={step.n}
                className="rounded-2xl border border-border bg-surface-2 p-5"
              >
                <span className="font-mono text-xs tracking-widest text-accent">
                  STEP {step.n}
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

        {/* Said plainly, because the alternative is an applicant waiting for a
            reply that no system is yet able to send. */}
        <ScrollReveal delay={0.24}>
          <p className="mt-8 text-xs text-muted">
            MalFleks is still being built. Applications are recorded and reviewed by
            a person — we are not yet able to approve partners the same day, and
            there is no automatic email confirming this.
          </p>
        </ScrollReveal>
      </div>
    </div>
  );
}
