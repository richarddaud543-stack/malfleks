import Link from "next/link";
import Hero from "@/components/home/Hero";
import AmbientBlob from "@/components/home/AmbientBlob";
import ShowcaseCarousel from "@/components/home/ShowcaseCarousel";
import { getFeatured } from "@/components/home/featured";
import BrandGrid, { groupBranchesByBrand } from "@/components/brand/BrandGrid";
import ScrollReveal from "@/components/motion/ScrollReveal";
import ScrollStagger from "@/components/motion/ScrollStagger";
import {
  getAllBranches,
  getAllBrands,
  getAllProducts,
} from "@/server/repositories";

export default async function Home() {
  // One round trip each, in parallel — these three queries are independent.
  const [brands, branches, products] = await Promise.all([
    getAllBrands(),
    getAllBranches(),
    getAllProducts(),
  ]);

  // Picked here rather than in the carousel: the client only needs the six
  // chosen items, not the whole catalogue it chose them from.
  const featured = getFeatured(brands, products);
  const branchesByBrandId = groupBranchesByBrand(branches);

  return (
    <div>
      <Hero brands={brands} branches={branches} />

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
          <BrandGrid brands={brands} branchesByBrandId={branchesByBrandId} />
        </div>
      </section>

      {/* One product per brand, cycling — the homepage's answer to the
          "auto-cycling showcase" move, built from the real catalogue rather
          than design templates. Sits in a `.panel` for the same "grouped
          into a mint block" treatment the marquee gets in the hero, so the
          page's rhythm of panel / plain section / panel stays consistent. */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <ScrollStagger>
          <div data-reveal>
            <p className="font-accent-serif italic text-accent">Showcase</p>
            <h2 className="mt-1 font-display text-3xl font-medium tracking-tight sm:text-4xl">
              A closer look, brand by brand
            </h2>
            <p className="mt-3 max-w-2xl text-muted">
              One pick from every brand on Soko, cycling on its own — pause
              it, or step through at your own pace.
            </p>
          </div>
          <div data-reveal className="panel mt-8 px-5 py-10 sm:px-8 sm:py-12">
            <ShowcaseCarousel items={featured} />
          </div>
        </ScrollStagger>
      </section>

      <section className="relative mx-auto max-w-6xl px-5 py-20">
        <AmbientBlob className="h-[300px] w-[300px] bg-accent-2/10 right-0 top-1/2" />
        <ScrollStagger className="relative">
          <div data-reveal>
            <p className="font-accent-serif italic text-accent">How it works</p>
            <h2 className="mt-1 font-display text-3xl font-medium tracking-tight sm:text-4xl">
              How delivery works
            </h2>
            <p className="mt-3 max-w-2xl text-muted">
              Every branch on Soko is tagged with its own delivery status —
              you always know exactly how your order will reach you before
              you commit.
            </p>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <div
              data-reveal
              className="glass-card rounded-2xl p-6 transition-shadow hover:shadow-[0_0_40px_-12px_var(--accent)]"
            >
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
            <div
              data-reveal
              className="glass-card rounded-2xl p-6 transition-shadow hover:shadow-[0_0_40px_-12px_var(--accent-3)]"
            >
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
          </div>
        </ScrollStagger>
      </section>
    </div>
  );
}
