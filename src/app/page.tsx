import Link from "next/link";
import Hero from "@/components/home/Hero";
import AmbientBlob from "@/components/home/AmbientBlob";
import BrandGrid from "@/components/brand/BrandGrid";
import ScrollReveal from "@/components/motion/ScrollReveal";
import { getAllBrands } from "@/data";

export default function Home() {
  const brands = getAllBrands();

  return (
    <div>
      <Hero />

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
        <AmbientBlob className="h-[300px] w-[300px] bg-accent-2/10 right-0 top-1/2" />
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
