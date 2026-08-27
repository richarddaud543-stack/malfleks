import type { PrismaClient } from "@prisma/client";
import { brands, branches, products, deliveryAgents } from "@/data";

/**
 * Loads the static catalogue in `src/data` into the database.
 *
 * The static arrays remain the editorial source of truth for now — the site
 * still reads them directly — so this script's job is to make the database an
 * exact mirror of them. It is convergent, not additive: running it twice leaves
 * the same rows, and a record deleted from `src/data` is deleted here too.
 *
 * That pruning used to be safe only because nothing else wrote to these
 * tables. Orders now do (`src/server/orders/create-order.ts`), and the prune
 * below is unchanged anyway: every one of `Order`'s catalogue references
 * (`productId`, `brandId`, `branchId`, `agentId`) is `onDelete: SetNull` in
 * the schema, not a required FK. Deleting a branch or product here — exactly
 * what this prune does for a record removed from `src/data` — nulls the
 * matching column on any order that pointed at it and leaves the order row,
 * its snapshot fields, and its history intact. A soft delete was the
 * alternative on the table; it turned out not to be needed, because the
 * schema already makes "the row is gone" and "the order is gone" two
 * different, and only one, of the two true outcomes.
 */
export interface SeedCounts {
  brands: number;
  branches: number;
  products: number;
  deliveryAgents: number;
}

export async function seedDatabase(prisma: PrismaClient): Promise<SeedCounts> {
  assertStaticDataIsConsistent();

  await prisma.$transaction(
    async (tx) => {
      for (const [index, brand] of brands.entries()) {
        const row = {
          slug: brand.slug,
          name: brand.name,
          category: brand.category,
          logo: brand.logo,
          accentColor: brand.accentColor,
          description: brand.description,
          website: brand.website ?? null,
          sortOrder: index,
        };
        await tx.brand.upsert({
          where: { id: brand.id },
          create: { id: brand.id, ...row },
          update: row,
        });
      }

      for (const [index, branch] of branches.entries()) {
        const row = {
          brandId: branch.brandId,
          name: branch.name,
          city: branch.city,
          region: branch.region,
          addressLine: branch.addressLine,
          country: branch.country,
          phone: branch.phone ?? null,
          hours: branch.hours,
          deliveryOffered: branch.deliveryOffered,
          verified: branch.verified,
          latitude: branch.coords?.lat ?? null,
          longitude: branch.coords?.lng ?? null,
          sortOrder: index,
        };
        await tx.branch.upsert({
          where: { id: branch.id },
          create: { id: branch.id, ...row },
          update: row,
        });
      }

      for (const [index, product] of products.entries()) {
        const row = {
          slug: product.slug,
          branchId: product.branchId,
          brandId: product.brandId,
          name: product.name,
          category: product.category,
          priceTZS: product.priceTZS,
          image: product.image,
          description: product.description,
          inStock: product.inStock,
          sortOrder: index,
        };
        await tx.product.upsert({
          where: { id: product.id },
          create: { id: product.id, ...row },
          update: row,
        });

        // Specs are replaced wholesale rather than diffed: the set is tiny, and
        // a rename ("Drive" -> "Drivetrain") must not leave the old key behind.
        await tx.productSpec.deleteMany({ where: { productId: product.id } });
        const specs = Object.entries(product.specs ?? {});
        if (specs.length > 0) {
          await tx.productSpec.createMany({
            data: specs.map(([key, value], position) => ({
              productId: product.id,
              key,
              value,
              position,
            })),
          });
        }
      }

      for (const [index, agent] of deliveryAgents.entries()) {
        const row = {
          name: agent.name,
          city: agent.city,
          phone: agent.phone,
          etaMinDays: agent.eta.minDays,
          etaMaxDays: agent.eta.maxDays,
          verified: agent.verified,
          sortOrder: index,
        };
        await tx.deliveryAgent.upsert({
          where: { id: agent.id },
          create: { id: agent.id, ...row },
          update: row,
        });

        await tx.agentRegion.deleteMany({ where: { agentId: agent.id } });
        await tx.agentRegion.createMany({
          data: agent.regionsServed.map((region, position) => ({
            agentId: agent.id,
            region,
            position,
          })),
        });
      }

      // Prune last: cascades from brands and branches clean up their children,
      // so removing a brand from `src/data` cannot orphan products.
      //
      // **Published submissions are exempt, and this is load-bearing.** A
      // product an admin published from a `ProductSubmission` has no
      // representation in `src/data` at all, so a `notIn` over the static array
      // matches it and deletes it. That was measured on 2026-08-27, the day
      // publishing landed: publish a product, re-seed, and the live listing was
      // gone — a partner's product silently removed by a routine `db:setup`,
      // taking the `Order.productId` of anyone who had ordered it with it.
      //
      // This is the first crack in debt #8's "two sources of one truth": the
      // database now holds rows the arrays have never heard of, which is
      // exactly what the reversal means. The prune's scope narrows to what it
      // was always really for — records that came *from* `src/data` — rather
      // than being switched off, because mirroring an edited array is still
      // its job until the arrays are retired.
      const publishedProductIds = (
        await tx.productSubmission.findMany({
          where: { publishedProductId: { not: null } },
          select: { publishedProductId: true },
        })
      )
        .map((s) => s.publishedProductId)
        .filter((id): id is string => id !== null);

      await tx.product.deleteMany({
        where: {
          id: { notIn: [...products.map((p) => p.id), ...publishedProductIds] },
        },
      });
      await tx.branch.deleteMany({
        where: { id: { notIn: branches.map((b) => b.id) } },
      });
      await tx.brand.deleteMany({
        where: { id: { notIn: brands.map((b) => b.id) } },
      });
      await tx.deliveryAgent.deleteMany({
        where: { id: { notIn: deliveryAgents.map((a) => a.id) } },
      });
    },
    // The default 5s interactive-transaction budget is tight for ~200 statements
    // on a cold SQLite file, and a half-seeded database is worse than a slow one.
    { timeout: 60_000, maxWait: 10_000 }
  );

  return {
    brands: brands.length,
    branches: branches.length,
    products: products.length,
    deliveryAgents: deliveryAgents.length,
  };
}

/**
 * The static data carries invariants the TypeScript types cannot express — ids
 * are hand-written, and `Product.brandId` is denormalised from its branch. The
 * seed is the last point where a typo is cheap to find, so check them here.
 */
function assertStaticDataIsConsistent(): void {
  assertUnique("brand id", brands, (b) => b.id);
  assertUnique("brand slug", brands, (b) => b.slug);
  assertUnique("branch id", branches, (b) => b.id);
  assertUnique("product id", products, (p) => p.id);
  assertUnique("product slug", products, (p) => p.slug);
  assertUnique("delivery agent id", deliveryAgents, (a) => a.id);

  const brandIds = new Set(brands.map((b) => b.id));
  const branchesById = new Map(branches.map((b) => [b.id, b]));

  for (const branch of branches) {
    if (!brandIds.has(branch.brandId)) {
      throw new Error(
        `Branch "${branch.id}" references unknown brand "${branch.brandId}"`
      );
    }
  }

  for (const product of products) {
    const branch = branchesById.get(product.branchId);
    if (!branch) {
      throw new Error(
        `Product "${product.id}" references unknown branch "${product.branchId}"`
      );
    }
    if (branch.brandId !== product.brandId) {
      throw new Error(
        `Product "${product.id}" claims brand "${product.brandId}" but its branch "${branch.id}" belongs to "${branch.brandId}"`
      );
    }
    if (!Number.isInteger(product.priceTZS) || product.priceTZS < 0) {
      throw new Error(
        `Product "${product.id}" has a non-integer or negative priceTZS (${product.priceTZS}); shillings are whole numbers`
      );
    }
  }
}

function assertUnique<T>(
  label: string,
  items: readonly T[],
  key: (item: T) => string
): void {
  const seen = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label}: "${value}"`);
    }
    seen.add(value);
  }
}
