import type { Metadata } from "next";
import Link from "next/link";

import { removeProductPhotoAction, setMainProductPhotoAction } from "@/app/actions/admin-catalogue-photos";
import { setProductHiddenAction, setProductStockAction, updateProductAction } from "@/app/actions/admin-console";
import ActionForm from "@/components/admin/ActionForm";
import ProductIcon from "@/components/product/ProductIcon";
import ProductPhoto from "@/components/product/ProductPhoto";
import { Badge, Empty, hrefWith, inputClass, labelClass, PageHeader, Pager, placeLabel, Tile, Tiles } from "@/components/admin/ui";
import { formatTZS } from "@/lib/charts";
import { searchCatalogue } from "@/server/admin/catalogue";
import { requireAdmin } from "@/server/auth/dal";
import { resolveSiteUrl } from "@/lib/site-url";
import { getAllBrands } from "@/server/repositories";

export const metadata: Metadata = {
  title: "Catalogue",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Params = { q?: string; brandId?: string; stock?: string; show?: string; page?: string };

/**
 * Every product, including hidden ones, with the three things an operator
 * actually does to a live listing: fix it, mark it out of stock, or take it
 * off the shop. Changes reach the shop within about a minute (the shop is a
 * separate deployment and is told to refresh). Orders already placed keep the
 * name and price they were placed at.
 */
export default async function AdminCataloguePage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin("/admin/catalogue");

  const params = await searchParams;
  const current = {
    q: params.q?.trim() || undefined,
    brandId: params.brandId || undefined,
    stock: params.stock || undefined,
    show: params.show || undefined,
  };
  const [result, brands] = await Promise.all([searchCatalogue({ ...current, page: Number(params.page) || 1 }), getAllBrands()]);
  const shopUrl = resolveSiteUrl().replace(/\/+$/, "");
  const filtered = Object.values(current).some(Boolean);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Catalogue"
        description="Every product on MalFleks. Edits go live on the shop within a minute; orders already placed keep the price they were placed at. New products come in through Submissions."
        actions={
          <Link href="/admin/submissions" className="rounded-md border border-border bg-white px-3.5 py-1.5 text-sm font-medium hover:border-accent">
            Submissions →
          </Link>
        }
      />

      <Tiles className="lg:grid-cols-3">
        <Tile label="Products" value={result.counts.all} note="Including hidden" />
        <Tile label="Out of stock" value={result.counts.outOfStock} note="Shown, but marked out of stock" />
        <Tile label="Hidden from the shop" value={result.counts.hidden} note="Customers can't see or order them" />
      </Tiles>

      <form action="/admin/catalogue" method="get" className="mt-4 rounded-xl border border-border bg-white p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="q" className={labelClass}>
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={current.q ?? ""} placeholder="Product, branch, brand, category…" className={inputClass} />
          </div>
          <div>
            <label htmlFor="brandId" className={labelClass}>
              Brand
            </label>
            <select id="brandId" name="brandId" defaultValue={current.brandId ?? ""} className={inputClass}>
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="stock" className={labelClass}>
              Stock
            </label>
            <select id="stock" name="stock" defaultValue={current.stock ?? ""} className={inputClass}>
              <option value="">Any</option>
              <option value="in">In stock</option>
              <option value="out">Out of stock</option>
            </select>
          </div>
          <div>
            <label htmlFor="show" className={labelClass}>
              On the shop
            </label>
            <select id="show" name="show" defaultValue={current.show ?? ""} className={inputClass}>
              <option value="">Any</option>
              <option value="live">Showing</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">
              Search
            </button>
            {filtered && (
              <Link href="/admin/catalogue" className="text-sm text-muted underline underline-offset-4 hover:text-accent">
                Clear
              </Link>
            )}
          </div>
        </div>
      </form>

      {result.rows.length === 0 ? (
        <Empty>{filtered ? "Nothing matches. Try a shorter search." : "No products yet. Published submissions appear here."}</Empty>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {result.rows.map((p) => (
            <li key={p.id} className={`rounded-xl border bg-white ${p.hiddenAt ? "border-dashed border-border" : "border-border"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                {/* What the shop shows for this product: its main photo, or
                    its icon when it has none. An operator scanning for the
                    listing with the wrong picture should not have to open
                    each one to find it. */}
                <ProductPhoto
                  src={p.photos[0]}
                  alt=""
                  size={48}
                  className="rounded-md border border-border"
                  fallback={
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border">
                      <ProductIcon icon={p.image} className="h-7 w-7 text-muted" />
                    </span>
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {p.name}
                    {p.hiddenAt && (
                      <span className="ml-2 align-middle">
                        <Badge status="hidden" />
                      </span>
                    )}
                    {!p.inStock && !p.hiddenAt && (
                      <span className="ml-2 align-middle">
                        <Badge status="out of stock" />
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {placeLabel(p.branchName, p.branchCity)} · <span className="capitalize">{p.category}</span>
                    {p.orders > 0 && ` · ${p.orders} ${p.orders === 1 ? "order" : "orders"}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold tabular-nums">{formatTZS(p.priceTZS)}</span>
                  {!p.hiddenAt && (
                    <a
                      href={`${shopUrl}/products/${p.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      View ↗
                    </a>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-start gap-2 border-t border-border/60 px-4 py-2.5">
                <ActionForm
                  action={setProductStockAction}
                  hidden={{ productId: p.id, inStock: String(!p.inStock) }}
                  label={p.inStock ? "Mark out of stock" : "Mark in stock"}
                  size="xs"
                  ariaLabel={`${p.inStock ? "Mark out of stock" : "Mark in stock"}: ${p.name}`}
                />
                <ActionForm
                  action={setProductHiddenAction}
                  hidden={{ productId: p.id, hidden: String(!p.hiddenAt) }}
                  label={p.hiddenAt ? "Put back on the shop" : "Hide from the shop"}
                  size="xs"
                  tone={p.hiddenAt ? "primary" : "danger"}
                  confirm={p.hiddenAt ? "Customers will see and be able to order it again." : "Customers won't see it or be able to order it."}
                  confirmLabel={p.hiddenAt ? "Yes, put it back" : "Yes, hide it"}
                  ariaLabel={`${p.hiddenAt ? "Put back" : "Hide"}: ${p.name}`}
                />
                <details className="group w-full sm:w-auto sm:flex-1">
                  <summary className="inline-flex cursor-pointer list-none rounded-md border border-border bg-white px-2.5 py-1 text-xs font-medium hover:border-accent">
                    <span className="group-open:hidden">Edit</span>
                    <span className="hidden group-open:inline">Close editor</span>
                  </summary>
                  <ActionForm
                    className="mt-3 max-w-2xl"
                    action={updateProductAction}
                    hidden={{ productId: p.id }}
                    label="Save changes"
                    pendingLabel="Saving…"
                    tone="primary"
                  >
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                      <div>
                        <label className={labelClass} htmlFor={`name-${p.id}`}>
                          Name
                        </label>
                        <input id={`name-${p.id}`} name="name" defaultValue={p.name} required maxLength={120} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass} htmlFor={`price-${p.id}`}>
                          Price (TSh)
                        </label>
                        <input
                          id={`price-${p.id}`}
                          name="priceTZS"
                          inputMode="numeric"
                          defaultValue={String(p.priceTZS)}
                          required
                          className={inputClass}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelClass} htmlFor={`desc-${p.id}`}>
                          Description
                        </label>
                        <textarea
                          id={`desc-${p.id}`}
                          name="description"
                          defaultValue={p.description}
                          rows={4}
                          maxLength={2000}
                          required
                          className={inputClass}
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="inStock" defaultChecked={p.inStock} className="h-4 w-4 accent-[var(--accent)]" />
                        In stock
                      </label>
                    </div>
                  </ActionForm>
                </details>
                {p.photos.length > 0 && (
                  <details className="group/photos w-full">
                    <summary className="inline-flex cursor-pointer list-none rounded-md border border-border bg-white px-2.5 py-1 text-xs font-medium hover:border-accent">
                      <span className="group-open/photos:hidden">
                        Photos ({p.photos.length})
                      </span>
                      <span className="hidden group-open/photos:inline">Close photos</span>
                    </summary>
                    {/* Remove one photo, or choose which comes first. Nothing
                        here edits a photo — a listing's pictures are the
                        partner's evidence of what they are selling. */}
                    <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {p.photos.map((photo, i) => (
                        <li key={photo} className="flex gap-3 rounded-lg border border-border/60 p-2">
                          <a href={photo} target="_blank" rel="noreferrer" aria-label={`Open photo ${i + 1} of ${p.name} full size`}>
                            <ProductPhoto
                              src={photo}
                              alt={`${p.name} — photo ${i + 1}`}
                              size={96}
                              className="rounded-md border border-border"
                              fallback={
                                <span className="flex h-24 w-24 items-center justify-center rounded-md border border-border text-center text-xs text-muted">
                                  Won&apos;t load
                                </span>
                              }
                            />
                          </a>
                          <div className="flex min-w-0 flex-col items-start gap-2">
                            <p className="text-xs text-muted">
                              {i === 0 ? "Main photo — shown in search" : `Photo ${i + 1}`}
                            </p>
                            {i > 0 && (
                              <ActionForm
                                action={setMainProductPhotoAction}
                                hidden={{ productId: p.id, photoUrl: photo }}
                                label="Make main"
                                size="xs"
                                ariaLabel={`Make photo ${i + 1} the main photo of ${p.name}`}
                              />
                            )}
                            <ActionForm
                              action={removeProductPhotoAction}
                              hidden={{ productId: p.id, photoUrl: photo }}
                              label="Remove"
                              size="xs"
                              tone="danger"
                              confirm={
                                p.photos.length === 1
                                  ? "This is its only photo. The shop will show the icon instead."
                                  : "Customers will no longer see this photo."
                              }
                              confirmLabel="Yes, remove it"
                              ariaLabel={`Remove photo ${i + 1} of ${p.name}`}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pager base="/admin/catalogue" current={current} page={result.page} pages={result.pages} total={result.total} noun={result.total === 1 ? "product" : "products"} />
      {filtered && (
        <p className="mt-2 text-xs text-muted">
          <Link href={hrefWith("/admin/catalogue", {}, { show: "hidden" })} className="underline underline-offset-4">
            See everything hidden
          </Link>
        </p>
      )}
    </div>
  );
}
