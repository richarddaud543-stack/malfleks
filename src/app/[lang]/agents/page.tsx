import type { Metadata } from "next";
import { PLACES } from "@/i18n/copy/places";
import { localeAlternates } from "@/i18n/locale";
import { pageLocale } from "@/i18n/server";
import Link from "next/link";
import { getAllDeliveryAgents } from "@/server/repositories";
import AgentCard from "@/components/delivery/AgentCard";
import EmptyCatalogue from "@/components/marketplace/EmptyCatalogue";
import ScrollReveal from "@/components/motion/ScrollReveal";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const locale = await pageLocale(params);
  return { title: PLACES[locale].agents.title, alternates: localeAlternates(locale, "/agents") };
}

export default async function AgentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ city?: string }>;
}) {
  const locale = await pageLocale(params);
  const copy = PLACES[locale].agents;
  const { city } = await searchParams;
  // Was module scope, which a query cannot be. This page already awaits
  // searchParams, so it was never static anyway (debt #3).
  const deliveryAgents = await getAllDeliveryAgents();
  const cities = Array.from(new Set(deliveryAgents.map((a) => a.city))).sort();

  const filtered = city
    ? deliveryAgents.filter(
        (a) => a.city === city || a.regionsServed.includes(city)
      )
    : deliveryAgents;

  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <ScrollReveal>
        <h1 className="font-display text-4xl font-medium tracking-tight">
          {copy.heading}
        </h1>
        <p className="mt-2 max-w-xl text-muted">
          {copy.intro}
        </p>
      </ScrollReveal>

      <ScrollReveal delay={0.1}>
        <div className="mt-8 flex flex-wrap gap-2">
          <Link
            href="/agents"
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              !city
                ? "border-accent bg-accent/15 text-accent"
                : "border-border text-muted hover:border-foreground/30"
            }`}
          >
            {copy.allCities}
          </Link>
          {cities.map((c) => (
            <Link
              key={c}
              href={`/agents?city=${encodeURIComponent(c)}`}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                city === c
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-muted hover:border-foreground/30"
              }`}
            >
              {c}
            </Link>
          ))}
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.15}>
        {deliveryAgents.length === 0 ? (
          // No couriers at all is a different thing from none in this city,
          // and "No agents found for this city yet" would quietly imply the
          // rest of Tanzania is covered.
          <div className="mt-8">
            <EmptyCatalogue looking="couriers" locale={locale} />
          </div>
        ) : (
        <div className="panel mt-8 p-4 sm:p-8">
          <h2 className="sr-only">{copy.list}</h2>
          <div className="space-y-4">
            {filtered.length > 0 ? (
              filtered.map((agent, i) => (
                <ScrollReveal key={agent.id} delay={0.05 * i}>
                  <AgentCard agent={agent} locale={locale} />
                </ScrollReveal>
              ))
            ) : (
              <p className="text-muted">
                {copy.noneInCity}
              </p>
            )}
          </div>
        </div>
        )}
      </ScrollReveal>
    </div>
  );
}
