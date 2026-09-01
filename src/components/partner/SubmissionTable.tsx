import Link from "next/link";

import ProductIcon from "@/components/product/ProductIcon";
import { formatTZS } from "@/lib/format";
import type { PartnerSubmission } from "@/server/partners/portal";

/**
 * A partner's own submissions.
 *
 * Takes rows as a prop and renders them — no fetching, no session, nothing to
 * mock — so the states that matter can be tested directly. The one that
 * matters most is `rejected`: a partner is owed the reason their product was
 * turned down, and `decisionNote` is the only place it exists. Dropping it
 * would leave them resubmitting the same thing forever.
 *
 * "Pending" is worded as *waiting on Soko*, not as a state of the product. A
 * partner reading "pending" about their own listing reasonably wonders what
 * they still have to do; the answer is nothing.
 */

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting on Soko",
  published: "Live on Soko",
  rejected: "Sent back to you",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-foreground/10 text-foreground",
  published: "bg-accent/15 text-accent",
  rejected: "bg-red-600/10 text-red-700 dark:text-red-400",
};

export default function SubmissionTable({
  submissions,
}: {
  submissions: PartnerSubmission[];
}) {
  if (submissions.length === 0) {
    return (
      <div className="glass-card rounded-2xl px-6 py-12 text-center">
        <p className="font-display text-lg font-medium">Nothing listed yet</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Products you submit appear here with what happened to them. Nothing
          you submit is visible to customers until Soko publishes it.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4">
      {submissions.map((submission) => (
        <li
          key={submission.id}
          className="glass-card rounded-2xl px-5 py-5 sm:px-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 gap-4">
              <ProductIcon
                icon={submission.image}
                className="h-10 w-10 shrink-0 text-muted"
              />
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-medium">
                  {submission.name}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {submission.category} · {formatTZS(submission.priceTZS)}
                  {!submission.inStock && " · Marked out of stock"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Submitted{" "}
                  {submission.createdAt.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>

            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                STATUS_CLASS[submission.status] ?? "bg-foreground/10"
              }`}
            >
              {STATUS_LABEL[submission.status] ?? submission.status}
            </span>
          </div>

          {/* The reason, when there is one. A partner who is not told why
              cannot fix it. */}
          {submission.status === "rejected" && (
            <p className="mt-4 border-l-2 border-red-600/40 pl-4 text-sm text-muted">
              {submission.decisionNote?.trim()
                ? submission.decisionNote
                : "Soko sent this back without leaving a reason. Contact us and we'll explain."}
            </p>
          )}

          {submission.status === "published" && submission.publishedProductId && (
            <Link
              href={`/products/${submission.publishedProductId}`}
              className="mt-4 inline-block text-sm text-accent underline decoration-border underline-offset-4"
            >
              See it on Soko
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
