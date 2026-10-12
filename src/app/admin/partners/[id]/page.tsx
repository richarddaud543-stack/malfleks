import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { setPartnerStatusAction } from "@/app/actions/admin-console";
import ActionForm from "@/components/admin/ActionForm";
import ShopDocumentsCard from "@/components/admin/ShopDocumentsCard";
import { Badge, Card, Empty, Facts, inputClass, labelClass, Notice, PageHeader, placeLabel, plural, Section, TableFrame, Th, Tile, Tiles } from "@/components/admin/ui";
import { ageLabel, formatTZS, formatWhen } from "@/lib/charts";
import { formatPhone } from "@/lib/order";
import { getPartnerDetail } from "@/server/admin/partners";
import { requireAdmin } from "@/server/auth/dal";
import { shopDocumentsView, shopVerificationState } from "@/server/partners/verification";

export const metadata: Metadata = {
  title: "Partner",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/partners/${id}`);

  const detail = await getPartnerDetail(id);
  if (!detail) notFound();

  const { partner, application, branch, agent, orders, statusCounts, products, submissionCounts, totals, batches, payoutPhone } = detail;
  const now = new Date();
  const suspended = partner.status !== "active";
  const totalOrders = Object.values(statusCounts).reduce((s, n) => s + n, 0);
  const isShop = partner.kind !== "courier";
  const [verification, documentsView] = isShop
    ? await Promise.all([shopVerificationState(partner.id), shopDocumentsView(partner.id)])
    : [null, null];
  const dateWords = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Dar_es_Salaam" });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ href: "/admin/partners", label: "Partners & brands" }}
        eyebrow={
          <>
            <span>{partner.kind === "courier" ? "Courier" : "Branch"}</span>
            {suspended ? <Badge status="suspended" /> : branch || agent ? <Badge status="live" /> : <Badge status="not live" />}
            <span>approved {formatWhen(partner.approvedAt)}</span>
          </>
        }
        title={partner.displayName}
        description={
          branch
            ? `${branch.brand.name} · ${placeLabel(branch.name, branch.city)}`
            : agent
              ? `Delivers from ${agent.city}${agent.regionsServed.length ? ` to ${agent.regionsServed.map((r) => r.region).join(", ")}` : ""}`
              : "Approved but not on the map yet — do that from Applications."
        }
      />

      {suspended && (
        <Notice tone="danger">
          <strong>Suspended</strong>
          {partner.statusChangedAt && ` ${ageLabel(partner.statusChangedAt, now)} ago`}
          {partner.statusNote && <> — &ldquo;{partner.statusNote}&rdquo;</>}. They can still sign in, but can&apos;t submit products or be
          put on the map. Their existing listings stay on the shop until hidden from Catalogue.
        </Notice>
      )}

      <Tiles>
        <Tile label="Orders" value={totalOrders} note={`${statusCounts.fulfilled ?? 0} delivered · ${statusCounts.pending ?? 0} waiting`} />
        <Tile label="Owed now" value={formatTZS((totals?.owedTZS ?? 0) + (totals?.inPayoutsTZS ?? 0))} note="Delivered, not yet sent" emphasis />
        <Tile label="Paid out so far" value={formatTZS(totals?.paidTZS ?? 0)} note={plural(batches.filter((b) => b.status === "paid").length, "payout")} />
        <Tile
          label={partner.kind === "courier" ? "Regions" : "Products live"}
          value={partner.kind === "courier" ? (agent ? agent.regionsServed.length + 1 : 0) : products.filter((p) => !p.hiddenAt).length}
          note={
            partner.kind === "courier"
              ? "Cities they deliver to"
              : `${submissionCounts.pending ?? 0} submitted, waiting · ${submissionCounts.rejected ?? 0} sent back`
          }
        />
      </Tiles>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Contact</h2>
            <div className="mt-3">
              <Facts
                items={[
                  { label: "Contact person", value: partner.contactName },
                  {
                    label: "Phone",
                    value: (
                      <a href={`tel:${partner.phone}`} className="font-mono text-accent hover:underline">
                        {formatPhone(partner.phone)}
                      </a>
                    ),
                  },
                  { label: "City", value: partner.city },
                  { label: "Pays out to", value: payoutPhone ? <span className="font-mono">{payoutPhone}</span> : <span className="text-muted">Not a mobile number — check before paying</span> },
                  ...(partner.address ? [{ label: "Address", value: partner.address, wide: true }] : []),
                  {
                    label: "Signs in as",
                    value: application?.email ?? `${partner.users.length} account${partner.users.length === 1 ? "" : "s"}`,
                  },
                  ...(application?.notes ? [{ label: "From their application", value: application.notes, wide: true }] : []),
                ]}
              />
            </div>
          </Card>

          <Section id="partner-orders" title="Recent orders" className="">
            {orders.length === 0 ? (
              <Empty>No orders yet.</Empty>
            ) : (
              <TableFrame minWidth={560}>
                <thead>
                  <tr className="border-b border-border">
                    <Th>Order</Th>
                    <Th>Product</Th>
                    <Th align="right">Goods</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="relative border-b border-border/60 last:border-0 hover:bg-[#f7faf8]">
                      <td className="px-4 py-2.5">
                        <Link href={`/admin/orders/${o.id}`} className="font-mono text-xs font-semibold text-accent after:absolute after:inset-0">
                          {o.reference}
                        </Link>
                        <p className="text-xs text-muted">{ageLabel(o.createdAt, now)} ago</p>
                      </td>
                      <td className="px-4 py-2.5">
                        {o.productName} <span className="text-muted">× {o.quantity}</span>
                        <p className="text-xs text-muted">{o.customerFullName}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatTZS(o.lineTotalTZS)}</td>
                      <td className="px-4 py-2.5">
                        <Badge status={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableFrame>
            )}
          </Section>

          {partner.kind !== "courier" && (
            <Section
              id="partner-products"
              title="Their products"
              className=""
              actions={
                branch && (
                  <Link href={`/admin/catalogue?q=${encodeURIComponent(branch.name)}`} className="text-xs font-medium text-accent hover:underline">
                    Edit in Catalogue →
                  </Link>
                )
              }
            >
              {products.length === 0 ? (
                <Empty>No products listed yet.</Empty>
              ) : (
                <ul className="mt-3 divide-y divide-border/60 rounded-xl border border-border bg-white">
                  {products.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {p.hiddenAt ? <Badge status="hidden" /> : !p.inStock && <Badge status="out of stock" />}
                        <span className="tabular-nums">{formatTZS(p.priceTZS)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {verification && (
            <ShopDocumentsCard
              partnerId={partner.id}
              displayName={partner.displayName}
              verifiedAt={verification.verifiedAt?.toISOString() ?? null}
              verifiedWhen={verification.verifiedAt ? formatWhen(verification.verifiedAt) : null}
              missing={verification.missing}
              documents={verification.documents.map((d) => ({ id: d.id, kind: d.kind, uploadedWhen: formatWhen(d.uploadedAt), aiVerdict: d.aiVerdict, aiNotes: d.aiNotes }))}
              deadline={documentsView?.deadline ? dateWords(documentsView.deadline) : null}
              hiddenByRule={documentsView?.hidden ?? false}
            />
          )}

          <Card className="p-4">
            <h2 className="text-sm font-semibold">Payouts</h2>
            {batches.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nothing paid out yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {batches.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <span>
                      <span className="tabular-nums">{formatTZS(b.totalTZS)}</span>
                      <span className="block text-xs text-muted">
                        {b.paidAt ? `sent ${formatWhen(b.paidAt)}` : `drawn up ${ageLabel(b.createdAt, now)} ago`}
                        {b.providerRef && ` · ${b.providerRef}`}
                      </span>
                    </span>
                    <Badge status={b.status} label={b.status === "pending" ? "to send" : b.status} />
                  </li>
                ))}
              </ul>
            )}
            {(totals?.owedTZS ?? 0) > 0 && (
              <Link href="/admin/payouts" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
                Pay {formatTZS(totals?.owedTZS ?? 0)} now →
              </Link>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold">{suspended ? "Reactivate" : "Suspend"}</h2>
            <p className="mt-1 text-xs text-muted">
              {suspended
                ? "They'll be able to submit products and be put on the map again."
                : "They keep their sign-in and their page, but can't submit products or be put on the map. It doesn't hide what's already on the shop — do that from Catalogue if you need to."}
            </p>
            <ActionForm
              className="mt-3"
              action={setPartnerStatusAction}
              hidden={{ partnerId: partner.id, status: suspended ? "active" : "suspended" }}
              label={suspended ? "Reactivate" : "Suspend"}
              tone={suspended ? "primary" : "danger"}
              confirm={suspended ? `Reactivate ${partner.displayName}?` : `Suspend ${partner.displayName}?`}
              confirmLabel={suspended ? "Yes, reactivate" : "Yes, suspend"}
            >
              <label htmlFor="status-note" className={labelClass}>
                {suspended ? "Note (optional)" : "Why? (required — shown on this page)"}
              </label>
              <input id="status-note" name="note" required={!suspended} maxLength={300} className={inputClass} />
            </ActionForm>
          </Card>
        </div>
      </div>
    </div>
  );
}
