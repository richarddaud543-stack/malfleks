"use client";

import { useEffect } from "react";
import Link from "next/link";

import { useLocale } from "@/i18n/client";
import { CHROME } from "@/i18n/copy/chrome";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const copy = CHROME[useLocale()].error;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-5 py-32 text-center">
      <p className="font-accent-serif text-6xl italic text-accent-3">{copy.eyebrow}</p>
      <h1 className="mt-4 font-display text-3xl font-medium tracking-tight">{copy.heading}</h1>
      <p className="mt-3 max-w-md text-muted">{copy.body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button onClick={reset} className="btn-pill btn-lime px-7 py-3">
          {copy.retry}
        </button>
        <Link href="/brands" className="btn-pill btn-outline px-7 py-3">
          {copy.brands}
        </Link>
      </div>
    </div>
  );
}
