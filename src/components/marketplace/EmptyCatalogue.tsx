import Link from "next/link";

/**
 * What every catalogue surface shows before a single real shop has listed
 * anything.
 *
 * MalFleks launched with an empty catalogue on purpose. The 6 brands, 19 branches,
 * 38 products and 5 couriers that used to be seeded here were **invented** —
 * plausible names, addresses nobody had confirmed and phone numbers that
 * counted upwards from `+255 68 000 0001`. A marketplace that shows a customer
 * a shop which does not exist has not launched early; it has lied. So the
 * catalogue was emptied and it fills up the only way it honestly can: a real
 * business applies, a person at MalFleks checks them, and their products appear.
 *
 * This component is what stands in the gap. It has one job beyond looking
 * unbroken — **an empty grid must not read as a failed page load.** A visitor
 * who thinks the site is broken leaves; a visitor who understands it is new
 * might come back, and might know a shop owner.
 */
export default function EmptyCatalogue({
  /** What this particular page was looking for: "brands", "branches", … */
  looking,
  /** Set on pages where a filter could also explain the emptiness. */
  filtered = false,
}: {
  looking: string;
  filtered?: boolean;
}) {
  return (
    <div className="glass-card rounded-2xl px-6 py-14 text-center sm:py-16">
      <p className="font-accent-serif text-lg italic text-accent">
        MalFleks is new
      </p>
      <h2 className="mt-2 font-display text-2xl font-medium tracking-tight sm:text-3xl">
        No {looking} listed yet
      </h2>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
        {filtered ? (
          <>
            Nothing matches — and there is nothing to match yet. MalFleks lists only
            businesses a person here has spoken to and checked, and we are
            still signing up the first of them.
          </>
        ) : (
          <>
            MalFleks lists only businesses a person here has spoken to and checked,
            and we are still signing up the first of them. Nothing invented goes
            on this site, so until a real shop joins, this page stays empty.
          </>
        )}
      </p>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted">
        If you run a shop or carry deliveries in Tanzania, this is the moment to
        be first.
      </p>
      <Link
        href="/apply"
        className="btn-pill btn-lime mt-8 inline-block px-6 py-2.5 text-sm"
      >
        Become a partner
      </Link>
    </div>
  );
}
