import type { Metadata } from "next";
import Link from "next/link";

import { Badge, Empty, PageHeader, Section, TableFrame, Th, Tile, Tiles } from "@/components/admin/ui";
import { formatTZS } from "@/lib/charts";
import { formatPhone } from "@/lib/order";
import { listBrands, listPartners } from "@/server/admin/partners";
import { requireAdmin } from "@/server/auth/dal";

export const metadata: Metadata = {
  title: "Partners & brands",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Who MalFleks works with. Partners are the approved accounts (branches and
 * couriers); brands are the catalogue they sit under. New applications and
 * "put on the map" stay on Applications — this page is for the ones already
 * in.
 */
export default async function AdminPartnersPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireAdmin("/admin/partners");
  const { kind } = await searchParams;

  const [partners, brands] = await Promise.all([listPartners(), listBrands()]);
  const shown = kind === "brand" || kind === "courier" ? partners.filter((p) => p.kind === kind) : partners;

  const live = partners.filter((p) => p.live && p.status === "active").length;
  const waiting = partners.filter((p) => !p.live && p.status === "active").length;
  const suspended = partners.filter((p) => p.status === "suspended").length;
  const owed = partners.reduce((s, p) => s + p.owedTZS, 0);

  const tab = (value: string | undefined, label: string, count: number) => {
    const active = kind === value || (!value && kind !== "brand" && kind !== "courier");
    return (
      <Link
        href={value ? `/admin/partners?kind=${value}` : "/admin/partners"}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
          active ? "border-accent bg-accent text-white" : "border-border bg-white hover:border-accent"
        }`}
      >
        {label}
        <span className={`text-xs tabular-nums ${active ? "text-white/80" : "text-muted"}`}>{count}</span>
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Partners & brands"
        description="Branches and couriers approved to work with MalFleks, and the brands in the catalogue."
        actions={
          <Link href="/admin/applications" className="rounded-md border border-border bg-white px-3.5 py-1.5 text-sm font-medium hover:border-accent">
            Applications →
          </Link>
        }
      />

      <Tiles>
        <Tile label="Live" value={live} note="On the map or in delivery routing" emphasis />
        <Tile label="Approved, not live yet" value={waiting} note={waiting ? "Put them on the map from Applications" : "None waiting"} />
        <Tile label="Suspended" value={suspended} note="Can sign in, can't list or go live" />
        <Tile label="Owed to partners" value={formatTZS(owed)} note="Delivered orders, not yet paid out" />
      </Tiles>

      <Section id="partners" title="Partners">
        <nav aria-label="Partner kind" className="mt-3 flex gap-1.5">
          {tab(undefined, "All", partners.length)}
          {tab("brand", "Branches", partners.filter((p) => p.kind === "brand").length)}
          {tab("courier", "Couriers", partners.filter((p) => p.kind === "courier").length)}
        </nav>
        {shown.length === 0 ? (
          <Empty>No partners yet. Approving an application on the Applications page creates one.</Empty>
        ) : (
          <TableFrame minWidth={880}>
            <thead>
              <tr className="border-b border-border">
                <Th>Partner</Th>
                <Th>Wired to</Th>
                <Th>Contact</Th>
                <Th align="right">Orders</Th>
                <Th align="right">Products</Th>
                <Th align="right">Owed</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="relative border-b border-border/60 align-top last:border-0 hover:bg-[#f7faf8]">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/partners/${p.id}`} className="font-medium text-accent after:absolute after:inset-0 hover:underline">
                      {p.displayName}
                    </Link>
                    <p className="text-xs text-muted">
                      {p.kind === "courier" ? "Courier" : "Branch"} · {p.city}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-sm">{p.wiredTo ?? <span className="text-muted">Not on the map yet</span>}</td>
                  <td className="px-4 py-2.5">
                    <p>{p.contactName}</p>
                    <p className="font-mono text-xs text-muted">{formatPhone(p.phone)}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {p.orders}
                    {p.orders > 0 && <span className="block text-xs text-muted">{p.ordersDelivered} delivered</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.kind === "courier" ? "—" : p.products}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.owedTZS ? formatTZS(p.owedTZS) : "—"}</td>
                  <td className="px-4 py-2.5">
                    {p.status === "suspended" ? <Badge status="suspended" /> : p.live ? <Badge status="live" /> : <Badge status="not live" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )}
      </Section>

      <Section
        id="brands"
        title="Brands"
        note="A brand can have branches nobody has claimed yet — researched catalogue entries. “Verified” means someone at MalFleks checked the branch against the business itself."
      >
        {brands.length === 0 ? (
          <Empty>No brands in the catalogue.</Empty>
        ) : (
          <TableFrame minWidth={760}>
            <thead>
              <tr className="border-b border-border">
                <Th>Brand</Th>
                <Th>Category</Th>
                <Th align="right">Branches</Th>
                <Th align="right">Partners</Th>
                <Th align="right">Products</Th>
                <Th align="right">Orders</Th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/catalogue?brandId=${b.id}`} className="font-medium text-accent hover:underline">
                      {b.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 capitalize text-muted">{b.category}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {b.branches}
                    <span className="block text-xs text-muted">{b.verifiedBranches} verified</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{b.partners}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {b.products}
                    {b.hiddenProducts > 0 && <span className="block text-xs text-muted">{b.hiddenProducts} hidden</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{b.orders}</td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )}
      </Section>
    </div>
  );
}
