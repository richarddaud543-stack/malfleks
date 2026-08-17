import { branches, brands, deliveryAgents, type DeliveryAgent } from "@/data";
import { buildLocatorData, type LocatorData } from "./locator";

/**
 * The locator dataset built from the static catalogue.
 *
 * Tests used to get this implicitly, because `locator.ts` read `src/data` at
 * module scope. Now that pages build it from the database, the tests need an
 * explicit equivalent — and building it from the same static arrays keeps every
 * existing assertion (four cities, north-to-south order, per-city courier
 * coverage) meaningful against known data rather than whatever the dev database
 * happens to hold.
 */
export function staticLocatorData(): LocatorData {
  const agentsByCity: Record<string, DeliveryAgent[]> = {};
  for (const city of new Set(branches.map((b) => b.city))) {
    agentsByCity[city] = deliveryAgents.filter(
      (a) => a.city === city || a.regionsServed.includes(city)
    );
  }
  return buildLocatorData(branches, brands, agentsByCity);
}
