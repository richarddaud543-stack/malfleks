"use client";

import { useState, useTransition } from "react";

import { setOwnProductStockAction } from "@/app/actions/partner-stock";

function errorMessage(reason: string | undefined): string {
  switch (reason) {
    case "not-found":
      return "This product isn't on the shop any more — reload the page.";
    case "partner-suspended":
      return "Your account is suspended, so stock can't be changed. Contact MalFleks.";
    case "signed-out":
      return "Your session has expired. Sign in again.";
    default:
      return "Couldn't save that. Nothing changed — try again.";
  }
}

/**
 * "Mark out of stock" / "Mark in stock" for one of a partner's own live
 * products.
 *
 * One press, no confirm step: it is the least destructive control on the
 * page, it is undone by pressing it again, and the moment a shop sells its
 * last one is not the moment to make them answer a question about it.
 *
 * The state shown is the server's answer, not an optimistic guess — the label
 * only changes once the action says it changed, so a failed save never leaves
 * the page claiming something the shop does not say.
 */
export default function StockToggle({
  productId,
  productName,
  inStock: initialInStock,
}: {
  productId: string;
  productName: string;
  inStock: boolean;
}) {
  const [inStock, setInStock] = useState(initialInStock);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setOwnProductStockAction(productId, !inStock);
      if (result.ok) setInStock(result.inStock);
      else setError(errorMessage(result.reason));
    });
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-label={`${inStock ? "Mark out of stock" : "Mark in stock"}: ${productName}`}
        className="min-h-11 rounded-full border border-border px-5 py-2 text-sm font-medium transition-colors hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Saving…" : inStock ? "Mark out of stock" : "Mark in stock"}
      </button>
      {/* What it is now, as text and not only as a button label — and the
          place a screen reader hears the change. */}
      <p role="status" className="text-xs text-muted">
        {inStock ? "In stock — customers can order it." : "Out of stock — customers can't order it."}
      </p>
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
