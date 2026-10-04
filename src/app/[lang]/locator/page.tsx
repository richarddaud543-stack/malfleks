import { PLACES } from "@/i18n/copy/places";
import { localeAlternates } from "@/i18n/locale";
import { pageLocale } from "@/i18n/server";
import { Suspense } from "react";
import type { Metadata } from "next";
import ScrollReveal from "@/components/motion/ScrollReveal";
import LocatorExplorer from "@/components/locator/LocatorExplorer";
import EmptyCatalogue from "@/components/marketplace/EmptyCatalogue";
import {
  buildLocatorData,
  getLocatorCities,
  type LocatorData,
} from "@/components/locator/locator";
import {
  getAllBranches,
  getAllBrands,
  getAllDeliveryAgents,
} from "@/server/repositories";
import type { DeliveryAgent } from "@/data";

/**
 * Builds the locator's dataset from the database.
 *
 * Agent coverage is grouped here rather than queried per city: the same match
 * `getAgentsForCity` makes (the agent's own city, or a region it serves), done
 * once over every agent instead of once per city.
 */
async function loadLocatorData(): Promise<LocatorData> {
  const [branches, brands, agents] = await Promise.all([
    getAllBranches(),
    getAllBrands(),
    getAllDeliveryAgents(),
  ]);

  const cities = Array.from(new Set(branches.map((b) => b.city)));
  const agentsByCity: Record<string, DeliveryAgent[]> = {};
  for (const city of cities) {
    agentsByCity[city] = agents.filter(
      (a) => a.city === city || a.regionsServed.includes(city)
    );
  }

  return buildLocatorData(branches, brands, agentsByCity);
}

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const copy = PLACES[locale].locator;
  const data = await loadLocatorData();
  const cityNames = getLocatorCities(data)
    .sort((a, b) => b.branchCount - a.branchCount)
    .map((c) => c.name);

  return {
    title: copy.title,
    alternates: localeAlternates(locale, "/locator"),
    // "Find all 0 branches across" is worse than saying nothing about the count.
    description:
      data.branches.length === 0
        ? copy.descriptionEmpty
        : copy.description(data.branches.length, cityNames.join(", ")),
  };
}

export default async function LocatorPage({ params }: Props) {
  const locale = await pageLocale(params);
  const copy = PLACES[locale].locator;
  const data = await loadLocatorData();
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="blob left-[14%] top-[-140px] h-[340px] w-[340px]"
          style={{ background: "var(--accent)", opacity: 0.12 }}
        />
        <div
          className="blob right-[8%] top-[-80px] h-[300px] w-[300px]"
          style={{
            background: "var(--lime)",
            opacity: 0.12,
            animationDelay: "-8s",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 py-16">
        <ScrollReveal>
          <h1 className="font-display text-4xl font-medium tracking-tight">
            {copy.headingStart}{" "}
            <span className="font-accent-serif text-accent italic">{copy.headingAccent}</span>
          </h1>
          <p className="mt-2 max-w-xl text-muted">
            {data.branches.length === 0
              ? copy.introEmpty
              : copy.intro}
          </p>
        </ScrollReveal>

        <div className="mt-12">
          {data.branches.length === 0 ? (
            // An empty map with no pins looks broken rather than new.
            <EmptyCatalogue looking="branches" locale={locale} />
          ) : (
            /* useSearchParams needs a Suspense boundary to keep this route static. */
            <Suspense fallback={<LocatorSkeleton />}>
              <LocatorExplorer data={data} />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

function LocatorSkeleton() {
  return (
    <div className="grid animate-pulse gap-10 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-12">
      <div className="aspect-square rounded-2xl bg-surface" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-surface" />
        ))}
      </div>
    </div>
  );
}
