import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-border/60 bg-surface/40">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 font-display text-lg font-medium">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
              Soko<span className="text-accent">.</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted">
              One place to browse authorized brand branches across Tanzania —
              and get every order delivered, whether the brand handles it or
              a local courier does.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-foreground">Explore</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li><Link href="/brands" className="hover:text-foreground">All brands</Link></li>
              <li><Link href="/agents" className="hover:text-foreground">Delivery agents</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium text-foreground">Categories</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>Automotive</li>
              <li>Electronics</li>
              <li>Telecom</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border/60 pt-6 text-xs text-muted">
          Prototype build. Brand logos are trademarks of their respective
          owners, used here for identification only.
        </div>
      </div>
    </footer>
  );
}
