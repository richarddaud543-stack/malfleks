"use client";

import { useState } from "react";
import type { Brand, BrandCategory } from "@/data";
import BrandGrid from "./BrandGrid";

const categories: { value: BrandCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "automotive", label: "Automotive" },
  { value: "electronics", label: "Electronics" },
  { value: "telecom", label: "Telecom" },
];

export default function BrandCatalog({ brands }: { brands: Brand[] }) {
  const [active, setActive] = useState<BrandCategory | "all">("all");

  const filtered =
    active === "all" ? brands : brands.filter((b) => b.category === active);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c.value}
            onClick={() => setActive(c.value)}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              active === c.value
                ? "border-accent bg-accent/15 text-accent"
                : "border-border text-muted hover:border-white/30"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-8">
        <BrandGrid brands={filtered} />
      </div>
    </div>
  );
}
