import type { Branch, Brand, DeliveryAgent, Product } from "@/data";
import {
  getAgentsForCity,
  getBranchById,
  getBrandById,
  getProductById,
} from "@/server/repositories";
import type { CatalogueSource } from "./build-order-request";

/**
 * The three catalogue records one order needs, read from the database.
 *
 * `buildOrderRequest` is pure and synchronous on purpose — that is what makes
 * the trust boundary cheap to test exhaustively — so the asynchronous part
 * lives here: fetch the product, then its branch and brand, and hand back a
 * lookup closed over exactly those three.
 *
 * It answers `undefined` for anything else, which is correct rather than
 * merely convenient: an order request naming one product must not be able to
 * make the builder resolve a different branch.
 *
 * Before this existed, orders were resolved against the static `src/data`
 * array while every browsing surface read from Postgres. A partner could get a
 * product published, a customer could open its page, and pressing the button
 * answered `unknown-product`.
 */
export async function databaseCatalogueFor(
  productId: string,
): Promise<CatalogueSource> {
  const product = await getProductById(productId);
  const branch = product ? await getBranchById(product.branchId) : undefined;
  const brand = product ? await getBrandById(product.brandId) : undefined;
  // Only the couriers that could serve this branch's city, and only when there
  // is a branch to serve.
  const agents = branch ? await getAgentsForCity(branch.city) : [];

  return {
    getProductById: (id: string): Product | undefined =>
      product && id === product.id ? product : undefined,
    getBranchById: (id: string): Branch | undefined =>
      branch && id === branch.id ? branch : undefined,
    getBrandById: (id: string): Brand | undefined =>
      brand && id === brand.id ? brand : undefined,
    getAgentsForCity: (city: string): DeliveryAgent[] =>
      branch && city === branch.city ? agents : [],
  };
}
