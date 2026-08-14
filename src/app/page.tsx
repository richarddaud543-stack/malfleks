import Link from "next/link";
import HeroSceneLoader from "@/components/three/HeroSceneLoader";
import BrandGrid from "@/components/brand/BrandGrid";
import ScrollReveal from "@/components/motion/ScrollReveal";
import MagneticButton from "@/components/motion/MagneticButton";
import { getAllBrands } from "@/data";

export default function Home() {
  const brands = getAllBrands();

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="blob h-[420px] w-[420px] bg-accent/25 -left-32 -top-32" />
        <div className="blob h-[380px] w-[380px] bg-accent-2/20 -right-24 top-10" style={{ animationDelay: "-6s" }} />
        <div className="blob h-[320px] w-[320px] bg-accent-3/15 left-1/3 bottom-0" style={{ animationDelay: "-11s" }} />
        <div className="bg-grid absolute inset-0 h-[600px]" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-10 pt-16 lg:grid-cols-[1.1fr_1fr] lg:pb-0 lg:pt-24">
          <div>
            <ScrollReveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Now live across Tanzania
              </span>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <h1 className="mt-6 font-display text-5xl font-medium leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
                Every brand
                <br />
                branch.{" "}
                <span className="font-accent-serif italic text-gradient">
                  One
                </span>
                <br />
                delivery promise.
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <p className="mt-6 max-w-md text-base text-muted">
                Browse authorized branches from Toyota, Ford, BMW, Oraimo,
                Apple and Halotel. If the branch delivers, we route your
                order straight to them — if not, we connect you to a
                trusted local courier automatically.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.3}>
              <div className="mt-9 flex flex-wrap gap-4">
                <MagneticButton href="/brands" variant="primary">
                  Explore brands
                </MagneticButton>
                <MagneticButton href="/search" variant="secondary">
                  Search products
                </MagneticButton>
                <MagneticButton href="/agents" variant="secondary">
                  Delivery agents
                </MagneticButton>
              </div>
            </ScrollReveal>
          </div>

          <div className="h-[420px] w-full sm:h-[520px] lg:-mr-10 lg:h-[600px]">
            <HeroSceneLoader />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <ScrollReveal>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-accent-serif italic text-accent">Catalog</p>
              <h2 className="mt-1 font-display text-3xl font-medium tracking-tight sm:text-4xl">
                Featured brands
              </h2>
            </div>
            <Link href="/brands" className="text-sm text-accent hover:underline">
              View all
            </Link>
          </div>
        </ScrollReveal>
        <div className="mt-8">
          <BrandGrid brands={brands} />
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-5 py-20">
        <div className="blob h-[300px] w-[300px] bg-accent-2/10 right-0 top-1/2" />
        <ScrollReveal>
          <p className="font-accent-serif italic text-accent">How it works</p>
          <h2 className="mt-1 font-display text-3xl font-medium tracking-tight sm:text-4xl">
            How delivery works
          </h2>
          <p className="mt-3 max-w-2xl text-muted">
            Every branch on Soko is tagged with its own delivery status —
            you always know exactly how your order will reach you before
            you commit.
          </p>
        </ScrollReveal>
        <div className="relative mt-8 grid gap-5 sm:grid-cols-2">
          <ScrollReveal delay={0.05}>
            <div className="glass-card rounded-2xl p-6 transition-shadow hover:shadow-[0_0_40px_-12px_var(--accent)]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Brand delivery
              </span>
              <p className="mt-4 text-sm text-muted">
                Some branches run their own delivery fleet. Order from one
                of these and the brand handles pickup and drop-off
                end-to-end.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={0.15}>
            <div className="glass-card rounded-2xl p-6 transition-shadow hover:shadow-[0_0_40px_-12px_var(--accent-3)]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                Local agent delivery
              </span>
              <p className="mt-4 text-sm text-muted">
                When a branch doesn&apos;t deliver directly, Soko connects
                you to a vetted local courier serving that branch&apos;s
                city so your order still gets to your door.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
