"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-5 py-32 text-center">
      <p className="font-accent-serif text-6xl italic text-accent-3">Oops</p>
      <h1 className="mt-4 font-display text-3xl font-medium tracking-tight">
        Something went wrong
      </h1>
      <p className="mt-3 max-w-md text-muted">
        This page hit an unexpected error. You can try again, or head back to
        the brand catalog.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button onClick={reset} className="btn-pill btn-lime px-7 py-3">
          Try again
        </button>
        <Link
          href="/brands"
          className="btn-pill border border-border px-7 py-3 text-sm font-medium text-foreground transition-colors hover:border-foreground/30"
        >
          Browse all brands
        </Link>
      </div>
    </div>
  );
}
