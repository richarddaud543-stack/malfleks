"use client";

import type { FacetOption } from "@/lib/search";

/**
 * One group of filter chips. Options with a zero count stay visible but
 * disabled — seeing that "Dodoma" exists and currently has nothing is more
 * useful than having it vanish mid-search.
 */
export default function FacetGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="text-xs font-medium tracking-wide text-muted uppercase">
        {title}
      </legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          const isEmpty = option.count === 0 && !isSelected;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              disabled={isEmpty}
              aria-pressed={isSelected}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                isSelected
                  ? "border-accent bg-accent/15 text-accent"
                  : isEmpty
                    ? "cursor-not-allowed border-border/50 text-muted/40"
                    : "border-border text-muted hover:border-white/30 hover:text-foreground"
              }`}
            >
              {option.label}
              <span className="ml-1.5 tabular-nums opacity-60">
                {option.count}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
