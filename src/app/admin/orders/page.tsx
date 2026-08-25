import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/dal";
import { listOrders } from "@/server/orders/list-orders";
import { getAllBranches } from "@/server/repositories";
import OrderCard from "@/components/admin/OrderCard";

export const metadata: Metadata = {
  title: "Orders",
  // Same reasoning as the rest of /admin: not in the sitemap, noindex.
  robots: { index: false, follow: false },
};

/**
 * Never prerendered, for the same reason `/admin` is not: `verifySession()`
 * short-circuits to `null` when no Admin credentials are present, *without*
 * reading cookies, and this page also reads `searchParams` for its filters —
 * either alone would already rule out a static build.
 */
export const dynamic = "force-dynamic";

/**
 * The order queue — an admin-facing view onto every persisted `Order` row, so
 * someone can actually work the phone: call the customer, call the branch,
 * confirm price and availability. Soko's own copy on `OrderRequestForm` says
 * it plainly: "This sends a request, not a paid order... the branch confirms
 * availability and price with you first." This page is where that call gets
 * made from.
 *
 * `requireAdmin()` gates it exactly like `/admin`: sign-in for a signed-out
 * visitor, `notFound()` for a signed-in non-admin.
 *
 * `OrderCard` (`src/components/admin/OrderCard.tsx`) renders each row and
 * carries the status-appropriate transition controls — `pending` shows
 * Confirm/Cancel, `confirmed` shows Mark fulfilled/Cancel, `fulfilled` and
 * `cancelled` show only the badge already rendered here. The workflow itself
 * lives in `src/server/orders/status.ts`.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string; status?: string }>;
}) {
  await requireAdmin("/admin/orders");

  const { branchId, status } = await searchParams;

  const [orders, branches] = await Promise.all([
    listOrders({ branchId, status }),
    getAllBranches(),
  ]);

  const filtered = Boolean(branchId) || Boolean(status);

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <p className="font-accent-serif text-xl italic text-accent">Admin</p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-4xl font-medium tracking-tight">
          Orders
        </h1>
        <Link
          href="/admin"
          className="text-sm text-muted underline decoration-border underline-offset-4 hover:text-accent"
        >
          Partner applications
        </Link>
      </div>
      <p className="mt-3 max-w-xl text-muted">
        Every submitted order request lands here. Nothing is charged and
        nothing is confirmed yet — the branch confirms availability and price
        with the customer by phone, using the details below.
      </p>

      <form
        action="/admin/orders"
        method="get"
        className="mt-8 flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-surface-2 p-4"
      >
        <div>
          <label htmlFor="branchId" className="block text-xs text-muted">
            Branch
          </label>
          <select
            id="branchId"
            name="branchId"
            defaultValue={branchId ?? ""}
            className="mt-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name} — {branch.city}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="block text-xs text-muted">
            Status
          </label>
          <input
            id="status"
            name="status"
            defaultValue={status ?? ""}
            placeholder="pending"
            className="mt-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-full border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-background"
        >
          Filter
        </button>
        {filtered && (
          <Link
            href="/admin/orders"
            className="text-sm text-muted underline decoration-border underline-offset-4 hover:text-accent"
          >
            Clear filters
          </Link>
        )}
      </form>

      <section aria-labelledby="orders-heading" className="mt-10">
        <h2
          id="orders-heading"
          className="font-display text-lg font-medium tracking-tight"
        >
          {filtered ? "Matching orders" : "Newest orders"}
          <span className="ml-2 text-sm font-normal text-muted tabular-nums">
            {orders.length}
          </span>
        </h2>

        {orders.length === 0 ? (
          <div className="glass-card mt-5 rounded-2xl px-6 py-12 text-center">
            <p className="font-display text-lg font-medium">
              {filtered ? "No orders match this filter" : "No orders yet"}
            </p>
            <p className="mt-2 text-sm text-muted">
              {filtered
                ? "Try clearing the branch or status filter."
                : "New requests from a product page land here."}
            </p>
          </div>
        ) : (
          <ul className="mt-5 flex flex-col gap-5">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
