"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * The home page's motion contract, in one place.
 *
 * `docs/research/engineering-standards.md` records what separates a premium
 * build from an expensive-looking one, and the architecture it names is
 * specific: *Lenis → ScrollTrigger on a shared ticker → one master timeline
 * split into overlapping phases → images preloaded before the timeline
 * starts.* Three of those four already existed — `SmoothScrollProvider`
 * collapses Lenis and ScrollTrigger onto a single `gsap.ticker` with
 * `lagSmoothing(0)`. This module supplies the missing two: the master
 * timeline, and the preload gate in front of it.
 *
 * **Why a gate at all.** The same research: "images preloaded before the
 * timeline starts, because scroll animation over unloaded images reads as
 * broken, not premium." The overture animates over brand logos; if a logo
 * pops in mid-reveal the whole sequence looks cheap. So nothing moves until
 * the fonts are ready and the above-the-fold images have decoded — and the
 * gate has a hard timeout, because a page that never animates because one
 * logo 404'd is worse than one that animates a beat late.
 */

/** How long to wait for assets before starting anyway. */
const PRELOAD_TIMEOUT_MS = 2000;

/**
 * Resolves once fonts and any already-in-DOM images are ready, or after
 * `PRELOAD_TIMEOUT_MS`, whichever comes first. Never rejects: a failed decode
 * is a reason to start the timeline, not to withhold it.
 */
function whenAssetsReady(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();

  const images = Array.from(document.images)
    .filter((img) => !img.complete)
    .map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    );

  const fonts = document.fonts?.ready
    ? document.fonts.ready.then(() => undefined)
    : Promise.resolve();

  const timeout = new Promise<void>((resolve) => {
    window.setTimeout(resolve, PRELOAD_TIMEOUT_MS);
  });

  return Promise.race([Promise.all([...images, fonts]).then(() => undefined), timeout]);
}

/**
 * Whether the user has asked for reduced motion, tracked live.
 *
 * Deliberately a local hook rather than Motion's `useReducedMotion`: this
 * module drives GSAP, not Motion, and `docs/research/motion-dev-design.md`
 * warns that `MotionConfig`'s `reducedMotion` default is `"never"` — every
 * motion component in this codebase branches on the preference itself rather
 * than trusting a library default. This keeps that property true here too.
 */
export function usePrefersReducedMotion(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    // Server snapshot. `false` rather than `true` deliberately: the CSS
    // resting state already shows everything, and the reduced-motion media
    // query in globals.css is what actually suppresses motion for those users
    // — it applies before any JS runs and does not depend on this value.
    () => false,
  );
}

/**
 * Builds the overture: the one timeline that plays on arrival, before any
 * scrolling has happened. Scroll-linked scenes own their own ScrollTriggers —
 * a single timeline scrubbed across the whole page would couple scenes that
 * have no reason to know about each other, and one edit would re-time
 * everything below it.
 *
 * Phases overlap on purpose. Sequential animations read as a list; overlapping
 * ones read as choreography, which is the entire difference the research is
 * pointing at.
 */
export function useOverture(
  scopeRef: React.RefObject<HTMLElement | null>,
  reduced: boolean,
) {
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;

    // Reduced motion: no timeline at all. The CSS resting state already shows
    // everything, and `.scene-ready` is never added, so the no-JS rule keeps
    // the lines visible. Nothing to clean up.
    if (reduced) {
      document.documentElement.classList.remove("scene-ready");
      return;
    }

    let ctx: gsap.Context | null = null;
    let cancelled = false;

    whenAssetsReady().then(() => {
      if (cancelled || !scopeRef.current) return;

      // Taking ownership: from here the CSS resting state defers to the
      // timeline. Set before the timeline builds so there is no frame where
      // the text is visible at rest and about to be yanked below the mask.
      document.documentElement.classList.add("scene-ready");

      ctx = gsap.context(() => {
        const tl = gsap.timeline({
          defaults: { ease: "expo.out", duration: 1.15 },
        });

        // Phase 1 — reveal: the headline rises out of its mask, line by line.
        tl.to("[data-scene-line] > span", {
          y: "0%",
          stagger: 0.085,
        });

        // Phase 2 — expand: the rule and the ambient glows open up underneath
        // the headline while its last line is still arriving (-=0.75).
        tl.from(
          "[data-scene-rule]",
          { scaleX: 0, transformOrigin: "left center", duration: 1.4 },
          "-=0.75",
        );
        tl.from(
          "[data-scene-glow]",
          { opacity: 0, scale: 0.6, duration: 1.8, stagger: 0.12 },
          "-=1.3",
        );

        // Phase 3 — content: everything that supports the headline.
        tl.from(
          "[data-scene-fade]",
          { opacity: 0, y: 22, duration: 0.9, stagger: 0.07 },
          "-=1.1",
        );

        // Phase 4 — settle: the counters land last, so the eye finishes on a
        // number rather than on motion.
        tl.from(
          "[data-scene-settle]",
          { opacity: 0, y: 12, duration: 0.7, stagger: 0.06 },
          "-=0.6",
        );
      }, scope);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
      document.documentElement.classList.remove("scene-ready");
    };
  }, [scopeRef, reduced]);
}

/**
 * Registers a scroll-linked reveal for one scene and returns nothing — the
 * caller passes a ref and forgets about it.
 *
 * `once: true` is not laziness: replaying a reveal every time a section
 * re-enters the viewport is the single most common tell of a scroll-animated
 * page built without an editor. A reveal is an arrival, and a thing can only
 * arrive once.
 */
export function useSceneReveal(
  ref: React.RefObject<HTMLElement | null>,
  reduced: boolean,
  options: { start?: string; stagger?: number } = {},
) {
  const { start = "top 78%", stagger = 0.08 } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;

    const ctx = gsap.context(() => {
      const targets = gsap.utils.toArray<HTMLElement>("[data-reveal]", el);
      if (targets.length === 0) return;

      gsap.from(targets, {
        opacity: 0,
        y: 34,
        duration: 1,
        ease: "expo.out",
        stagger,
        scrollTrigger: {
          trigger: el,
          start,
          once: true,
        },
      });
    }, el);

    return () => ctx.revert();
  }, [ref, reduced, start, stagger]);
}
