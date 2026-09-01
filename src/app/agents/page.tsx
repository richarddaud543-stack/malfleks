import Link from "next/link";
import { getAllDeliveryAgents } from "@/server/repositories";
import AgentCard from "@/components/delivery/AgentCard";
import EmptyCatalogue from "@/components/marketplace/EmptyCatalogue";
import ScrollReveal from "@/components/motion/ScrollReveal";

export const metadata = {
  title: "Delivery agents",
};

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
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
          Delivery agents
        </h1>
        <p className="mt-2 max-w-xl text-muted">
          When a branch can&apos;t deliver directly, these local couriers
          step in — filter by city to see who covers your area.
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
            All cities
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
            <EmptyCatalogue looking="couriers" />
          </div>
        ) : (
        <div className="panel mt-8 p-4 sm:p-8">
          <div className="space-y-4">
            {filtered.length > 0 ? (
              filtered.map((agent, i) => (
                <ScrollReveal key={agent.id} delay={0.05 * i}>
                  <AgentCard agent={agent} />
                </ScrollReveal>
              ))
            ) : (
              <p className="text-muted">
                No agents found for this city yet.
              </p>
            )}
          </div>
        </div>
        )}
      </ScrollReveal>
    </div>
  );
}
