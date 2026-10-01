import { getPrisma } from "@/server/db/client";
import {
  mapBranch,
  mapBrand,
  mapDeliveryAgent,
  mapProduct,
} from "@/server/db/mappers";
import type { Brand, Branch, DeliveryAgent, Product } from "@/data/types";

// Database-backed twin of `src/data/index.ts`. Same function names, same
// argument order, same return shapes — the only difference is that every
// function is async, because a query is. Cutting a server component over is
// therefore `import { ... } from "@/server/repositories"` plus an `await`.
//
// Ordering is not incidental: the static accessors return records in source
// declaration order, so every list query sorts by the `sortOrder` column the
// seed writes from the array index. Without it the two implementations would
// return the same set in a different order and the site's layout would shift.

export type { Brand, Branch, Product, DeliveryAgent, BrandCategory } from "@/data/types";

export async function getAllBrands(): Promise<Brand[]> {
  const rows = await getPrisma().brand.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map(mapBrand);
}

export async function getBrandBySlug(slug: string): Promise<Brand | undefined> {
  const row = await getPrisma().brand.findUnique({ where: { slug } });
  return row ? mapBrand(row) : undefined;
}

export async function getBrandById(id: string): Promise<Brand | undefined> {
  const row = await getPrisma().brand.findUnique({ where: { id } });
  return row ? mapBrand(row) : undefined;
}

export async function getBranchesByBrandId(brandId: string): Promise<Branch[]> {
  const rows = await getPrisma().branch.findMany({
    where: { brandId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(mapBranch);
}

export async function getBranchById(id: string): Promise<Branch | undefined> {
  const row = await getPrisma().branch.findUnique({ where: { id } });
  return row ? mapBranch(row) : undefined;
}

// Every customer-facing product read goes through this file, and each one
// leaves out a product an admin has taken off the shop (`Product.hiddenAt`).
// The order builder reads through `getProductById` too, so a hidden product
// cannot be ordered by someone holding an old link.
const ON_SALE = { hiddenAt: null } as const;

export async function getProductsByBranchId(branchId: string): Promise<Product[]> {
  const rows = await getPrisma().product.findMany({
    where: { branchId, ...ON_SALE },
    orderBy: { sortOrder: "asc" },
    include: { specs: { orderBy: { position: "asc" } } },
  });
  return rows.map(mapProduct);
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const row = await getPrisma().product.findFirst({
    where: { id, ...ON_SALE },
    include: { specs: { orderBy: { position: "asc" } } },
  });
  return row ? mapProduct(row) : undefined;
}

/**
 * Agents whose home city is `city`, plus agents who list `city` among the
 * regions they serve — a nationwide courier based in Dar es Salaam must still
 * surface for a Dodoma order. Matches the static implementation exactly,
 * including its case-sensitive, exact-string comparison.
 */
export async function getAgentsForCity(city: string): Promise<DeliveryAgent[]> {
  const rows = await getPrisma().deliveryAgent.findMany({
    where: {
      OR: [{ city }, { regionsServed: { some: { region: city } } }],
    },
    orderBy: { sortOrder: "asc" },
    include: { regionsServed: { orderBy: { position: "asc" } } },
  });
  return rows.map(mapDeliveryAgent);
}

// The static module also exports the raw arrays (`brands`, `branches`,
// `products`, `deliveryAgents`), which a handful of call sites use for search
// indexing and `generateStaticParams`. Those get full-table reads rather than a
// re-exported constant, so the difference stays visible at the call site.

export async function getAllBranches(): Promise<Branch[]> {
  const rows = await getPrisma().branch.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map(mapBranch);
}

export async function getAllProducts(): Promise<Product[]> {
  const rows = await getPrisma().product.findMany({
    where: ON_SALE,
    orderBy: { sortOrder: "asc" },
    include: { specs: { orderBy: { position: "asc" } } },
  });
  return rows.map(mapProduct);
}

export async function getAllDeliveryAgents(): Promise<DeliveryAgent[]> {
  const rows = await getPrisma().deliveryAgent.findMany({
    orderBy: { sortOrder: "asc" },
    include: { regionsServed: { orderBy: { position: "asc" } } },
  });
  return rows.map(mapDeliveryAgent);
}
