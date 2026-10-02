import type { Metadata } from "next";
import Link from "next/link";

import { Badge, Empty, hrefWith, inputClass, labelClass, PageHeader, Pager, placeLabel, TableFrame, Th } from "@/components/admin/ui";
import { ageLabel, formatTZS } from "@/lib/charts";
import { formatPhone } from "@/lib/order";
import { ORDER_STATUSES, searchOrders } from "@/server/admin/orders";
import { requireAdmin } from "@/server/auth/dal";
import { getAllBrands } from "@/server/repositories";

export const metadata: Metadata = {
  title: "Orders",
  // Same reasoning as the rest of /admin: not in the sitemap, noindex.
  robots: { index: false, follow: false },
};

/** Never prerendered: it is behind a session and reads its filters from the URL. */
export const dynamic = "force-dynamic";

type Params = { q?: string; status?: string; brandId?: string; payment?: string; from?: string; to?: string; page?: string };

const PAYMENT_LABEL: Record<string, string> = {
  captured: "paid",
  pending: "link sent",
  failed: "failed",
};

/**
 * Every order, searchable. Each row opens the order's own page, where the
 * customer, the money and the full history are, and where it is confirmed,
 * fulfilled or cancelled.
 *
 * Filters live in the URL, so a filtered view can be bookmarked or sent to
 * someone, and the browser's back button does what it should.
 */
export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin("/admin/orders");

  const params = await searchParams;
  const current = {
    q: params.q?.trim() || undefined,
    status: params.status || undefined,
    brandId: params.brandId || undefined,
    payment: params.payment || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
  };
  const page = Number(params.page) || 1;

  const [result, brands] = await Promise.all([searchOrders({ ...current, page }), getAllBrands()]);
  const now = new Date();
  const filtered = Object.values(current).some(Boolean);

  const chips: { key: string | undefined; label: string; count: number }[] = [
    { key: undefined, label: "All", count: result.statusCounts.all },
    ...ORDER_STATUSES.map((s) => ({ key: s, label: s[0].toUpperCase() + s.slice(1), count: result.statusCounts[s] ?? 0 })),
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Orders"
        description="Customers pay MalFleks when they order, and paying confirms the order; MalFleks holds the money until it is delivered. Open an order to call the customer, take payment, or move it on."
      />

      <form action="/admin/orders" method="get" className="mt-5 rounded-xl border border-border bg-white p-3">
        {current.status && <input type="hidden" name="status" value={current.status} />}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="q" className={labelClass}>
              Search
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={current.q ?? ""}
              placeholder="Reference, customer, phone, product…"
              className={inputClass}
            />
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
            <label htmlFor="payment" className={labelClass}>
              Payment
            </label>
            <select id="payment" name="payment" defaultValue={current.payment ?? ""} className={inputClass}>
              <option value="">Any</option>
              <option value="captured">Paid</option>
              <option value="pending">Link sent, not paid</option>
              <option value="failed">Attempt failed</option>
              <option value="none">No payment asked</option>
            </select>
          </div>
          <div>
            <label htmlFor="from" className={labelClass}>
              From
            </label>
            <input id="from" name="from" type="date" defaultValue={current.from ?? ""} className={inputClass} />
          </div>
          <div>
            <label htmlFor="to" className={labelClass}>
              To
            </label>
            <input id="to" name="to" type="date" defaultValue={current.to ?? ""} className={inputClass} />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">
              Search
            </button>
            {filtered && (
              <Link href="/admin/orders" className="text-sm text-muted underline underline-offset-4 hover:text-accent">
                Clear
              </Link>
            )}
          </div>
        </div>
      </form>

      <nav aria-label="Order status" className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
        {chips.map((chip) => {
          const active = current.status === chip.key;
          return (
            <Link
              key={chip.label}
              href={hrefWith("/admin/orders", current, { status: chip.key, page: undefined })}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                active ? "border-accent bg-accent text-white" : "border-border bg-white text-foreground hover:border-accent"
              }`}
            >
              {chip.label}
              <span className={`text-xs tabular-nums ${active ? "text-white/80" : "text-muted"}`}>{chip.count}</span>
            </Link>
          );
        })}
      </nav>

      {result.rows.length === 0 ? (
        <Empty>
          {filtered ? "No orders match. Try a shorter search or clear a filter." : "No orders yet. Requests from product pages land here."}
        </Empty>
      ) : (
        <>
          {/* Phones: one line of what matters per order. */}
          <ul className="mt-3 flex flex-col gap-2 sm:hidden">
            {result.rows.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.id}`} className="block rounded-xl border border-border bg-white px-4 py-3 hover:border-accent">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{o.reference}</span>
                    <span className="flex gap-1">
                      <Badge status={o.status} />
                      {o.payment && <Badge status={o.payment} label={PAYMENT_LABEL[o.payment] ?? o.payment} />}
                    </span>
                  </div>
                  <p className="mt-1 font-medium">
                    {o.productName} × {o.quantity}
                  </p>
                  <p className="text-xs text-muted">
                    {o.customerFullName} · {ageLabel(o.createdAt, now)} ago · {formatTZS(o.orderTotalTZS ?? o.lineTotalTZS)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden sm:block">
            <TableFrame minWidth={860}>
              <thead>
                <tr className="border-b border-border">
                  <Th>Order</Th>
                  <Th>Customer</Th>
                  <Th>Product</Th>
                  <Th align="right">Total</Th>
                  <Th>Status</Th>
                  <Th>Payment</Th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((o) => (
                  <tr key={o.id} className="relative border-b border-border/60 align-top last:border-0 hover:bg-[#f7faf8]">
                    <td className="px-4 py-2.5">
                      {/* The link covers the whole row (see `after:` below), so anywhere on it opens the order. */}
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-mono text-xs font-semibold text-accent after:absolute after:inset-0 hover:underline"
                      >
                        {o.reference}
                      </Link>
                      <p className="text-xs text-muted" title={o.createdAt.toISOString()}>
                        {ageLabel(o.createdAt, now)} ago
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p>{o.customerFullName}</p>
                      <p className="font-mono text-xs text-muted">{formatPhone(o.customerPhone)}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p>
                        {o.productName} <span className="text-muted">× {o.quantity}</span>
                      </p>
                      <p className="text-xs text-muted">
                        {placeLabel(o.branchName, o.branchCity)}
                        {o.routeKind === "agent" ? ` · courier ${o.routeCarrier}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {o.orderTotalTZS != null ? (
                        formatTZS(o.orderTotalTZS)
                      ) : (
                        <span title="No delivery fee set for this route yet, so only the goods are priced">
                          {formatTZS(o.lineTotalTZS)}
                          <span className="block text-xs text-muted">goods only</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge status={o.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      {o.payment ? (
                        <Badge status={o.payment} label={PAYMENT_LABEL[o.payment] ?? o.payment} />
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          </div>
        </>
      )}

      <Pager base="/admin/orders" current={current} page={result.page} pages={result.pages} total={result.total} noun={result.total === 1 ? "order" : "orders"} />
    </div>
  );
}
