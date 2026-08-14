"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";

const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

export default function HeroSceneLoader() {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <div className="h-full w-full rounded-3xl bg-gradient-to-br from-surface-2 via-surface to-background" />
    );
  }

  return <HeroScene />;
}
