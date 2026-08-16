"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Registered once at module scope (idempotent — every other component in
// this round that drives a ScrollTrigger calls this too, since module
// evaluation order across separately-chunked client components isn't
// guaranteed). Safe in SSR: registration just teaches gsap's plugin
// resolver about the class, it doesn't touch `window`/`document` until a
// ScrollTrigger is actually created, which only ever happens inside a
// "use client" component's effect.
gsap.registerPlugin(ScrollTrigger);

/**
 * Lenis (smooth scroll) and GSAP's ScrollTrigger (used by ScrollStagger and
 * any future scroll-linked component under src/components/motion or
 * src/components/home) both want to own "what does scroll progress mean
 * right now" — left to run independently they fight: Lenis eases the
 * *visual* position toward the target on its own rAF-driven timeline, while
 * ScrollTrigger, listening only to native `scroll` events, recalculates a
 * frame or more later, so pinned/scrubbed elements lag and stutter behind
 * the smooth-scrolled page instead of tracking it.
 *
 * The fix (GSAP's own documented recipe for pairing the two) is to collapse
 * both onto a single rAF loop and force ScrollTrigger to recompute on every
 * Lenis tick rather than waiting for its own listener:
 *   - `gsap.ticker.add(...)` replaces the old standalone
 *     `requestAnimationFrame` loop — gsap.ticker *is* the rAF loop now, and
 *     Lenis rides it instead of running a second one alongside it.
 *   - `lenis.raf(time * 1000)` — gsap.ticker's callback receives elapsed
 *     time in seconds; Lenis expects milliseconds.
 *   - `gsap.ticker.lagSmoothing(0)` disables GSAP's default behavior of
 *     silently "catching up" after a stutter (e.g. a long task), which would
 *     otherwise desync its notion of time from Lenis's own easing.
 *   - `lenis.on("scroll", ScrollTrigger.update)` recalculates every
 *     ScrollTrigger instance's progress synchronously on each Lenis tick,
 *     instead of on the native `scroll` event Lenis's `window.scrollTo`
 *     calls do still technically fire (which lags by design).
 */
export default function SmoothScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.1,
      smoothWheel: true,
    });

    lenis.on("scroll", ScrollTrigger.update);

    function update(time: number) {
      lenis.raf(time * 1000);
    }
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(update);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
