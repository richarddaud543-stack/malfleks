import Link from "next/link";
import type { Branch } from "@/data";
import DeliveryBadge from "../delivery/DeliveryBadge";

export default function BranchCard({
  branch,
  brandSlug,
}: {
  branch: Branch;
  brandSlug: string;
}) {
  return (
    <Link
      href={`/brands/${brandSlug}/branches/${branch.id}`}
      // See BrandCard.tsx for why lift/tilt/glow live in `.tint-glow` alone
      // rather than a duplicate `hover:-translate-y-*` utility here.
      className="glass-card tint-glow block rounded-2xl p-5 hover:border-foreground/20 focus-visible:border-foreground/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-medium">{branch.name}</h3>
          <p className="mt-1 text-sm text-muted">
            {branch.addressLine ?? branch.city}
          </p>
          {branch.hours && (
            <p className="mt-1 text-xs text-muted">{branch.hours}</p>
          )}
        </div>
        <DeliveryBadge deliveryOffered={branch.deliveryOffered} />
      </div>
      {!branch.addressLine && (
        <p className="mt-3 text-[11px] text-muted">
          Exact address not published — confirm with the brand first
        </p>
      )}
    </Link>
  );
}
