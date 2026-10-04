import Link from "next/link";

import { CHROME } from "@/i18n/copy/chrome";
import { getLocale } from "@/i18n/server";

export default function NotFound() {
  const copy = CHROME[getLocale()].notFound;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-5 py-32 text-center">
      <p className="font-accent-serif text-6xl italic text-accent">404</p>
      <h1 className="mt-4 font-display text-3xl font-medium tracking-tight">{copy.heading}</h1>
      <p className="mt-3 max-w-md text-muted">{copy.body}</p>
      {/* Three ways on, not one: a visitor who mistyped a product link wants
          search, not the brand list. */}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/search" className="btn-pill btn-lime px-7 py-3">
          {copy.search}
        </Link>
        <Link href="/brands" className="btn-pill btn-ink px-7 py-3">
          {copy.brands}
        </Link>
        <Link href="/" className="btn-pill btn-outline px-7 py-3">
          {copy.home}
        </Link>
      </div>
    </div>
  );
}
