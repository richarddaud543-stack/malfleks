import { getPrisma, resetPrisma } from "../src/server/db/client";
import { assertDestructiveAllowed } from "../src/server/db/destructive-guard";
import { seedDatabase } from "../src/server/db/seed";

// Thin CLI wrapper. The logic lives in `src/server/db/seed.ts` so the test suite
// can seed a throwaway database by calling it directly instead of shelling out.
//
// The guard is here and not in `seedDatabase`, on purpose: the suites seed their
// own throwaway schemas by calling that function directly, and they should not
// have to opt out of a protection aimed at a human at a terminal. This wrapper
// is the only path a human takes.
async function main(): Promise<void> {
  assertDestructiveAllowed("db:seed (it prunes every product not in the seed set)");

  const counts = await seedDatabase(getPrisma());
  console.log(
    `Seeded ${counts.brands} brands, ${counts.branches} branches, ` +
      `${counts.products} products, ${counts.deliveryAgents} delivery agents.`
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => resetPrisma());
