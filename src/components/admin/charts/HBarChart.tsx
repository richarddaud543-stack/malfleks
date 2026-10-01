import { formatValue, type ValueFormat } from "@/lib/charts";

/**
 * Ranked horizontal bars with the value at each bar's tip. One series, one
 * colour: these categories (brands) have no order of their own, so a colour
 * ramp would only restate the bar lengths.
 *
 * Every value is printed, so there is nothing a tooltip would add. Plain
 * HTML rather than SVG, which also means it needs no client JavaScript.
 */
export default function HBarChart({
  rows,
  valueFormat,
}: {
  rows: { label: string; value: number }[];
  valueFormat: ValueFormat;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="viz flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,7rem)_1fr] items-center gap-3 text-sm">
          <span className="truncate text-muted" title={r.label}>
            {r.label}
          </span>
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-3 rounded-r-[4px]"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, maxWidth: "calc(100% - 4.5rem)", background: "var(--viz-series)" }}
            />
            <span className="shrink-0 font-semibold text-foreground tabular-nums">{formatValue(valueFormat, r.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
