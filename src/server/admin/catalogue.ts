import type { Prisma } from "@prisma/client";

import { getPrisma } from "@/server/db/client";
import { MAX_PRICE_TZS } from "@/lib/product-listing";
import { productPhotoList } from "@/lib/product-photo";

/**
 * Every product on MalFleks, for the console — including hidden ones, which
 * the shop never sees (`src/server/repositories` filters them out).
 *
 * Edits here change the live listing straight away. They never touch orders
 * already placed: an `Order` snapshots name, price and branch at the moment
 * it was made, so changing a price today cannot re-price yesterday's order.
 */

export const CATALOGUE_PAGE_SIZE = 50;

export interface CatalogueSearch {
  q?: string;
  brandId?: string;
  /** "in" | "out" */
  stock?: string;
  /** "live" | "hidden" */
  show?: string;
  page?: number;
}

export interface CatalogueRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  priceTZS: number;
  inStock: boolean;
  hiddenAt: Date | null;
  description: string;
  image: string;
  photoUrl: string | null;
  /** Every photo, main one first. Empty when the product has none. */
  photos: string[];
  brandName: string;
  branchName: string;
  branchCity: string;
  orders: number;
}

export function catalogueWhere(search: CatalogueSearch): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];
  const q = search.q?.trim();
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { branch: { name: { contains: q, mode: "insensitive" } } },
        { brand: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (search.brandId) and.push({ brandId: search.brandId });
  if (search.stock === "in") and.push({ inStock: true });
  if (search.stock === "out") and.push({ inStock: false });
  if (search.show === "live") and.push({ hiddenAt: null });
  if (search.show === "hidden") and.push({ hiddenAt: { not: null } });
  return and.length ? { AND: and } : {};
}

export async function searchCatalogue(search: CatalogueSearch) {
  const db = getPrisma();
  const page = Math.max(1, Math.floor(search.page ?? 1));
  const where = catalogueWhere(search);

  const [total, rows, counts] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: [{ brand: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      skip: (page - 1) * CATALOGUE_PAGE_SIZE,
      take: CATALOGUE_PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        name: true,
        category: true,
        priceTZS: true,
        inStock: true,
        hiddenAt: true,
        description: true,
        image: true,
        photoUrl: true,
        photoUrls: true,
        brand: { select: { name: true } },
        branch: { select: { name: true, city: true } },
        _count: { select: { orders: true } },
      },
    }),
    Promise.all([
      db.product.count(),
      db.product.count({ where: { hiddenAt: { not: null } } }),
      db.product.count({ where: { inStock: false, hiddenAt: null } }),
    ]),
  ]);

  return {
    rows: rows.map(
      (r): CatalogueRow => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        category: r.category,
        priceTZS: r.priceTZS,
        inStock: r.inStock,
        hiddenAt: r.hiddenAt,
        description: r.description,
        image: r.image,
        photoUrl: r.photoUrl,
        photos: productPhotoList(r),
        brandName: r.brand.name,
        branchName: r.branch.name,
        branchCity: r.branch.city,
        orders: r._count.orders,
      }),
    ),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / CATALOGUE_PAGE_SIZE)),
    counts: { all: counts[0], hidden: counts[1], outOfStock: counts[2] },
  };
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

export interface ProductEdit {
  name: string;
  priceTZS: string | number;
  description: string;
  inStock: boolean;
}

export type ProductEditOutcome =
  | { ok: true }
  | { ok: false; reason: "not-found" | "bad-name" | "bad-price" | "bad-description" };

/**
 * Validates an edit. Pure. Returns the clean values or the first problem.
 *
 * Same price ceiling as a partner's own listing form. The description is
 * looser than that form's 20–800, because it has to accept every listing
 * already live — some researched catalogue copy is shorter or longer — and
 * refusing to save a price change over a description nobody touched would be
 * absurd.
 */
export function validateProductEdit(input: ProductEdit):
  | { ok: true; value: { name: string; priceTZS: number; description: string; inStock: boolean } }
  | { ok: false; reason: "bad-name" | "bad-price" | "bad-description" } {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) return { ok: false, reason: "bad-name" };

  const rawPrice = typeof input.priceTZS === "number" ? String(input.priceTZS) : input.priceTZS;
  const cleaned = rawPrice.replace(/[,\s]/g, "").replace(/^TSh/i, "");
  if (!/^\d+$/.test(cleaned)) return { ok: false, reason: "bad-price" };
  const priceTZS = Number(cleaned);
  if (!Number.isSafeInteger(priceTZS) || priceTZS <= 0 || priceTZS > MAX_PRICE_TZS) return { ok: false, reason: "bad-price" };

  const description = input.description.trim();
  if (description.length < 10 || description.length > 2_000) return { ok: false, reason: "bad-description" };

  return { ok: true, value: { name, priceTZS, description, inStock: Boolean(input.inStock) } };
}

export async function updateProduct(productId: string, input: ProductEdit): Promise<ProductEditOutcome> {
  const checked = validateProductEdit(input);
  if (!checked.ok) return checked;
  const { count } = await getPrisma().product.updateMany({ where: { id: productId }, data: checked.value });
  return count === 1 ? { ok: true } : { ok: false, reason: "not-found" };
}

/** Takes a product off the shop, or puts it back. Idempotent. */
export async function setProductHidden(productId: string, hidden: boolean): Promise<{ ok: boolean }> {
  const { count } = await getPrisma().product.updateMany({
    where: { id: productId, hiddenAt: hidden ? null : { not: null } },
    data: { hiddenAt: hidden ? new Date() : null },
  });
  if (count === 1) return { ok: true };
  // Already in the requested state counts as success; a missing product does not.
  const exists = await getPrisma().product.count({ where: { id: productId } });
  return { ok: exists === 1 };
}

/** Quick stock toggle from the list, without opening the editor. */
export async function setProductStock(productId: string, inStock: boolean): Promise<{ ok: boolean }> {
  const { count } = await getPrisma().product.updateMany({ where: { id: productId }, data: { inStock } });
  return { ok: count === 1 };
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export type ProductPhotoOutcome =
  | { ok: true }
  | { ok: false; reason: "not-found" | "no-such-photo" | "changed" };

/** The photo list with one photo taken out, or `null` if it is not in it. Pure. */
export function withoutPhoto(photos: readonly string[], url: string): string[] | null {
  return photos.includes(url) ? photos.filter((photo) => photo !== url) : null;
}

/** The photo list with one photo moved to the front, or `null` if it is not in it. Pure. */
export function withMainPhoto(photos: readonly string[], url: string): string[] | null {
  return photos.includes(url) ? [url, ...photos.filter((photo) => photo !== url)] : null;
}

/**
 * Applies a change to a live product's photos.
 *
 * Read, compute, then write **only if the row still holds what was read** —
 * `photoUrl` and `photoUrls` are both in the WHERE. Two operators tidying the
 * same listing at once otherwise overwrite each other: one removes photo 3,
 * the other makes photo 3 the main one from a list read a second earlier, and
 * the removed photo is back on the shop. The loser is told to look again
 * rather than silently winning. Same shape as every other guarded
 * `updateMany` in this console.
 *
 * `photoUrl` is rewritten alongside the list every time, so "the main photo
 * is the first of the list" stays true for everything that reads only the one
 * column.
 */
async function changeProductPhotos(
  productId: string,
  change: (photos: string[]) => string[] | null,
): Promise<ProductPhotoOutcome> {
  const db = getPrisma();
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { photoUrl: true, photoUrls: true },
  });
  if (!product) return { ok: false, reason: "not-found" };

  const next = change(productPhotoList(product));
  if (!next) return { ok: false, reason: "no-such-photo" };

  const { count } = await db.product.updateMany({
    where: {
      id: productId,
      photoUrl: product.photoUrl,
      photoUrls: { equals: product.photoUrls },
    },
    data: { photoUrls: next, photoUrl: next[0] ?? null },
  });
  return count === 1 ? { ok: true } : { ok: false, reason: "changed" };
}

/**
 * Takes one photo off a live product — a photo that shows the wrong item, a
 * phone number written across it, somebody's face. The listing itself stays
 * up; with its last photo gone it falls back to its icon.
 *
 * The file is left in the bucket. The console holds no Storage credentials
 * that could delete another account's upload (there is no service-role key
 * anywhere in this app, by design), and nothing links to the file once the
 * product stops naming it.
 */
export function removeProductPhoto(productId: string, url: string): Promise<ProductPhotoOutcome> {
  return changeProductPhotos(productId, (photos) => withoutPhoto(photos, url));
}

/** Chooses which of a live product's photos shoppers see first. */
export function setMainProductPhoto(productId: string, url: string): Promise<ProductPhotoOutcome> {
  return changeProductPhotos(productId, (photos) => withMainPhoto(photos, url));
}
