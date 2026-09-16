import Link from "next/link";

/**
 * The home page before any real shop has listed anything.
 *
 * The five-scene home (`SceneOverture` → `SceneClose`) is built on the
 * catalogue: it counts branches, marches logos across a marquee and pins a
 * rail of products. With an empty catalogue every one of those renders as a
 * blank band, and the first impression of MalFleks becomes a page that failed to
 * load. So the empty state is not a degraded version of that page — it is a
 * different page, which says the true thing plainly and asks for the one
 * action that can change it.
 *
 * A server component on purpose: no scroll timelines, no GSAP, nothing to
 * choreograph. There is one message here and it should arrive immediately.
 *
 * Delete this the day it stops being reachable? No — keep it. A marketplace
 * can empty out again, and the honest page for that day should already exist.
 */
export default function SceneOpening() {
  return (
    <section className="scene-grain relative overflow-hidden px-5 py-28 sm:py-36">
      <div
        aria-hidden
        className="scene-glow left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2"
        style={{ background: "var(--scene-mint)", opacity: 0.1 }}
      />

      <div className="relative mx-auto max-w-3xl text-center">
        <p className="scene-eyebrow">MalFleks in Tanzania</p>

        <h1 className="scene-display-sm mt-6">
          One marketplace for real shops,{" "}
          <em className="scene-serif">and whoever brings it to you</em>
        </h1>

        <p
          className="mx-auto mt-7 max-w-xl text-lg leading-relaxed"
          style={{ color: "var(--scene-muted)" }}
        >
          MalFleks puts branches from every brand in one place and answers the
          question a listing usually leaves out: who actually delivers this, the
          shop&apos;s own van or a courier who covers your city.
        </p>

        <div className="scene-panel mx-auto mt-12 max-w-xl px-6 py-7 text-left sm:px-8">
          <h2 className="font-display text-lg font-medium">
            Nothing is listed yet — and that is deliberate
          </h2>
          <p
            className="mt-3 text-sm leading-relaxed"
            style={{ color: "var(--scene-muted)" }}
          >
            We could fill this page with invented shops. Plenty of new
            marketplaces do. But an address nobody has checked sends someone
            across a city for nothing, and a phone number that rings nowhere is
            worse than none at all. Every branch here will be one a person at
            MalFleks has spoken to.
          </p>
          <p
            className="mt-3 text-sm leading-relaxed"
            style={{ color: "var(--scene-muted)" }}
          >
            So the catalogue starts empty and fills the slow way.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/apply" className="scene-cta px-8 py-4 text-sm">
            List your shop on MalFleks
          </Link>
          <Link href="/search" className="scene-chip px-8 py-4 text-sm">
            See the marketplace
          </Link>
        </div>

        <p className="mt-12 text-sm" style={{ color: "var(--scene-muted)" }}>
          Applying is free, takes a few minutes, and a person reads every one.
        </p>
      </div>
    </section>
  );
}
