import Link from "next/link";

export const metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-5 py-32 text-center">
      <p className="font-accent-serif text-6xl italic text-accent">404</p>
      <h1 className="mt-4 font-display text-3xl font-medium tracking-tight">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-3 max-w-md text-muted">
        The brand, branch or product you&apos;re looking for doesn&apos;t
        exist — it may have moved, or the link might be out of date.
      </p>
      {/* Three ways on, not one: a visitor who mistyped a product link wants
          search, not the brand list. */}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/search" className="btn-pill btn-lime px-7 py-3">
          Search products
        </Link>
        <Link href="/brands" className="btn-pill btn-ink px-7 py-3">
          Browse all brands
        </Link>
        <Link href="/" className="btn-pill btn-outline px-7 py-3">
          Home
        </Link>
      </div>
    </div>
  );
}
