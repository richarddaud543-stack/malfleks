"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";
import ProductIcon from "../product/ProductIcon";
import { iconAccent } from "@/lib/accent";

const ProductShowcaseScene = dynamic(() => import("./ProductShowcaseScene"), {
  ssr: false,
});

export default function ProductShowcaseLoader({
  accentColor,
  icon,
}: {
  accentColor: string;
  icon: string;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <div
        className="flex h-full w-full items-center justify-center rounded-3xl"
        style={{ background: `${accentColor}18` }}
      >
        <div
          className="flex h-28 w-28 items-center justify-center rounded-full"
          style={{ background: `${accentColor}22` }}
        >
          <ProductIcon
            icon={icon}
            className="h-16 w-16"
            style={{ color: iconAccent(accentColor) }}
          />
        </div>
      </div>
    );
  }

  return <ProductShowcaseScene accentColor={accentColor} icon={icon} />;
}
