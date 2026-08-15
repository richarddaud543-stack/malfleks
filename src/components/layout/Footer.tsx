import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mx-auto mt-24 max-w-6xl px-3 pb-6 sm:px-6">
      <div className="panel px-6 py-12 sm:px-10 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 font-display text-lg font-medium">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent-2" />
              Soko<span className="text-accent-2">.</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted">
              One place to browse authorized brand branches across Tanzania —
              and get every order delivered, whether the brand handles it or
              a local courier does.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Explore</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li><Link href="/brands" className="transition-colors hover:text-foreground">All brands</Link></li>
              <li><Link href="/agents" className="transition-colors hover:text-foreground">Delivery agents</Link></li>
              <li><Link href="/locator" className="transition-colors hover:text-foreground">Branch locator</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Categories</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>Automotive</li>
              <li>Electronics</li>
              <li>Telecom</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-foreground/10 pt-6 text-xs text-muted">
          Prototype build. Brand logos are trademarks of their respective
          owners, used here for identification only.
        </div>
      </div>
    </footer>
  );
}
