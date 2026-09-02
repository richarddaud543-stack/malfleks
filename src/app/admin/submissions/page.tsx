import type { Metadata } from "next";
import Link from "next/link";

import SubmissionReviewCard from "@/components/admin/SubmissionReviewCard";
import { requireAdmin } from "@/server/auth/dal";
import { listPendingSubmissions } from "@/server/partners/submissions";
import { getAllBranches, getAllBrands } from "@/server/repositories";

export const metadata: Metadata = {
  title: "Product submissions",
  robots: { index: false, follow: false },
};

/** Never prerendered, for the reason stated on `/admin`. */
export const dynamic = "force-dynamic";

/**
 * The queue that closes the partner loop.
 *
 * A branch partner submits a product from `/partner/products/new`, it lands in
 * `ProductSubmission`, and until this page existed it stopped there — the
 * server functions to publish or reject it were written, tested and called by
 * nothing. From the partner's side that was indistinguishable from being
 * ignored.
 *
 * Publishing creates the live `Product`, in one guarded transaction that also
 * stamps `publishedProductId` back onto the submission — which is what puts the
 * "See it on Soko" link on the partner's own page.
 */
export default async function AdminSubmissionsPage() {
  await requireAdmin("/admin/submissions");

  const [submissions, branches, brands] = await Promise.all([
    listPendingSubmissions(),
    getAllBranches(),
    getAllBrands(),
  ]);

  const branchById = new Map(branches.map((b) => [b.id, b]));
  const brandById = new Map(brands.map((b) => [b.id, b]));

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <p className="font-accent-serif text-xl italic text-accent">Admin</p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-4xl font-medium tracking-tight">
          Product submissions
        </h1>
        <Link
          href="/admin"
          className="text-sm text-muted underline decoration-border underline-offset-4 hover:text-accent"
        >
          Applications
        </Link>
      </div>
      <p className="mt-3 max-w-xl text-muted">
        Products branch partners want listed. Nothing here is visible to a
        customer until you publish it, and publishing puts it on the live site
        straight away.
      </p>

      {submissions.length === 0 ? (
        <div className="glass-card mt-10 rounded-2xl px-6 py-12 text-center">
          <p className="font-display text-lg font-medium">Nothing waiting</p>
          <p className="mt-2 text-sm text-muted">
            Products submitted from <code>/partner</code> land here.
          </p>
        </div>
      ) : (
        <ul className="mt-10 flex flex-col gap-5">
          {submissions.map((submission) => {
            const branch = submission.branchId
              ? branchById.get(submission.branchId)
              : undefined;
            const brand = submission.brandId
              ? brandById.get(submission.brandId)
              : undefined;

            // A submission from a partner who is not on the map yet cannot be
            // published at all — `canPublish` answers `no-branch`. Saying so
            // here, on the row, beats letting the admin find out by clicking.
            const branchLabel = branch
              ? `${brand?.name ?? "Unknown brand"} — ${branch.name}, ${branch.city}`
              : "This partner isn't on the map yet — put them on the map first, from the applications page.";

            return (
              <SubmissionReviewCard
                key={submission.id}
                submission={submission}
                branchLabel={branchLabel}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
