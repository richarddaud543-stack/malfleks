"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "motion/react";

gsap.registerPlugin(ScrollTrigger);

/**
 * GSAP ScrollTrigger's answer to `ScrollReveal`. `ScrollReveal` gives every
 * wrapped element its own independent `whileInView` trigger — fine for a
 * single block, but stacking several of them (as Hero and the homepage's
 * section headers used to) produces N separately-timed IntersectionObservers
 * rather than one considered sequence, and their individual trigger points
 * drift apart depending on each element's own position on the page.
 *
 * `ScrollStagger` instead marks every child that should participate with
 * `data-reveal`, and animates all of them off *one* ScrollTrigger — a single
 * arrival, cascading through the marked elements in document order. That's
 * the piece of Spline's scroll vocabulary worth taking: not "fade things in
 * as you pass them" but "this group arrives together, in a deliberate
 * order."
 *
 * `data-reveal` is a descendant selector by design (not `:scope > *`), so a
 * marked element can sit inside its own layout wrapper (e.g. two cards
 * inside a `grid` div) without that wrapper needing to be a stagger target
 * itself — see the two-card section on the homepage for exactly this.
 *
 * Deliberately does not touch `/search` or `/brands`: prior research on this
 * project concluded scroll choreography fights comparison tasks on pages
 * built for scanning many results at once, so this component is only reached
 * for from the homepage.
 */
export default function ScrollStagger({
  children,
  className,
  stagger = 0.12,
  y = 28,
  start = "top 82%",
}: {
  children: React.ReactNode;
  className?: string;
  /** Delay between each `[data-reveal]` element's arrival, in seconds. */
  stagger?: number;
  /** Distance (px) each element travels as it arrives. */
  y?: number;
  /** ScrollTrigger `start` position, e.g. "top 82%" (element top vs. viewport). */
  start?: string;
}) {
  const reduceMotion = useReducedMotion();
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (reduceMotion || !scope.current) return;
      const items = scope.current.querySelectorAll<HTMLElement>("[data-reveal]");
      if (items.length === 0) return;

      gsap.set(items, { opacity: 0, y });
      gsap.to(items, {
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: "power3.out",
        stagger,
        scrollTrigger: {
          trigger: scope.current,
          start,
          once: true,
        },
      });
    },
    { scope, dependencies: [reduceMotion] }
  );

  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  );
}
