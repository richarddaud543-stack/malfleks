import { Suspense } from "react";
import type { Metadata } from "next";
import ScrollReveal from "@/components/motion/ScrollReveal";
import SearchExplorer from "@/components/search/SearchExplorer";
import { products } from "@/data";

export const metadata: Metadata = {
  title: "Search",
  description:
    `Search ${products.length} products across every brand, branch and city on Soko — ` +
    "filter by brand, category, city, price and delivery method.",
};

export default function SearchPage() {
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="blob left-[10%] top-[-120px] h-[320px] w-[320px]"
          style={{ background: "var(--accent)", opacity: 0.16 }}
        />
        <div
          className="blob right-[5%] top-[-60px] h-[280px] w-[280px]"
          style={{
            background: "var(--accent-2)",
            opacity: 0.14,
            animationDelay: "-6s",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 py-16">
        <ScrollReveal>
          <h1 className="font-display text-4xl font-medium tracking-tight">
            Search the{" "}
            <span className="font-accent-serif italic text-accent">
              whole marketplace
            </span>
          </h1>
          <p className="mt-2 max-w-xl text-muted">
            Every product from every brand branch across Tanzania, in one place.
            Filter by city to see what is near you, or by delivery to see who
            brings it to your door themselves.
          </p>
        </ScrollReveal>

        <div className="mt-10">
          {/* useSearchParams needs a Suspense boundary to keep this route static. */}
          <Suspense fallback={<SearchSkeleton />}>
            <SearchExplorer />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-12 rounded-full bg-surface" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        <div className="hidden h-64 rounded-2xl bg-surface lg:block" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-surface" />
          ))}
        </div>
      </div>
    </div>
  );
}
