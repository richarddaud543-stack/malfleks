import { getPrisma, resetPrisma } from "../src/server/db/client";
import { seedDatabase } from "../src/server/db/seed";

// Thin CLI wrapper. The logic lives in `src/server/db/seed.ts` so the test suite
// can seed a throwaway database by calling it directly instead of shelling out.
async function main(): Promise<void> {
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
