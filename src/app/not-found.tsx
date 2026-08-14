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
      <Link
        href="/brands"
        className="mt-8 inline-flex items-center justify-center rounded-full bg-accent px-7 py-3 text-sm font-medium text-background transition-shadow hover:shadow-[0_0_32px_4px_rgba(124,158,255,0.45)]"
      >
        Browse all brands
      </Link>
    </div>
  );
}
