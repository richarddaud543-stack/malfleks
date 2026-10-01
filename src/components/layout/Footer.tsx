import Link from "next/link";

export default function Footer() {
  return (
    <footer data-site-chrome="" className="mx-auto mt-24 max-w-6xl px-3 pb-6 sm:px-6">
      <div className="panel px-6 py-12 sm:px-10 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 font-display text-lg font-medium">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent-2" />
              MalFleks<span className="text-accent-2">.</span>
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
              <li><Link href="/apply" className="transition-colors hover:text-foreground">Become a partner</Link></li>
            </ul>
          </div>

          {/*
            This column listed "Automotive / Electronics / Telecom" as plain
            text until 2026-09-01 — three categories that were never links and
            that described the seeded placeholder catalogue rather than
            anything a visitor could reach. With the catalogue emptied they
            described nothing at all. Categories now come from what partners
            actually list, so the space goes to the pages every site owes its
            visitors and this one did not have.
          */}
          <div>
            <h3 className="text-sm font-semibold text-foreground">MalFleks</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li><Link href="/contact" className="transition-colors hover:text-foreground">Contact</Link></li>
              <li><Link href="/terms" className="transition-colors hover:text-foreground">Terms of use</Link></li>
              <li><Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-foreground/10 pt-6 text-xs text-muted">
          {/*
            This said "Prototype build" until 2026-08-31, on a site the public
            could already reach. The trademark sentence is the part that
            matters and it stays; the word prototype was telling visitors the
            wrong thing about whether this is real.
          */}
          Brand logos are trademarks of their respective owners, used here for
          identification only. MalFleks takes no payment and holds no stock.
        </div>
      </div>
    </footer>
  );
}
