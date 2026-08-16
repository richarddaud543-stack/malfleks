"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * A highlight band swept across a skeleton block — the shimmer most loading
 * UIs reach for instead of a flat opacity pulse, because it reads as
 * "actively working" rather than "stalled and blinking." One block per call
 * site; the band is absolutely positioned inside it and loops on its own
 * clock, staggered by `delay` so a grid of these doesn't pulse in lockstep.
 *
 * Reduced motion drops the band entirely rather than slowing it down: a
 * route-level loading state is exactly the "not usable without motion" case
 * the standing constraint exists for, and the block still reads as a
 * skeleton on its own from shape and colour alone.
 */
export default function LoadingShimmer({
  className = "",
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={`relative overflow-hidden bg-surface ${className}`}>
      {!reduceMotion && (
        <motion.div
          aria-hidden="true"
          className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent"
          animate={{ x: ["0%", "400%"] }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: "linear",
            delay,
          }}
        />
      )}
    </div>
  );
}
