/**
 * Pure helpers behind the admin charts: day buckets, axis ticks, number
 * formats. No React, no DOM -- every function here is testable on its own.
 */

/**
 * Days are East Africa Time, not UTC, because that is when the business's
 * days actually start. An order placed at 01:00 in Dar es Salaam is 22:00 UTC
 * the previous evening; bucketing by UTC would file it under the wrong day.
 * EAT has no daylight saving, so stepping back in exact 24-hour steps from
 * "now" visits every calendar day exactly once.
 */
export const BUSINESS_TIME_ZONE = "Africa/Dar_es_Salaam";

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `YYYY-MM-DD` for the business day a moment falls on. */
export function dayKey(moment: Date): string {
  return dayKeyFormat.format(moment);
}

/** The last `count` business days, oldest first, ending with today. */
export function lastDays(now: Date, count: number): string[] {
  const days: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    days.push(dayKey(new Date(now.getTime() - back * 86_400_000)));
  }
  return days;
}

export interface DayPoint {
  day: string;
  value: number;
}

/**
 * Sum `value` per business day over the last `count` days. Days with nothing
 * are present as 0 -- a gap in a time series must read as "nothing happened",
 * never as "no data", or the eye fills it in.
 */
export function seriesByDay<T>(
  items: readonly T[],
  at: (item: T) => Date,
  value: (item: T) => number,
  now: Date,
  count: number,
): DayPoint[] {
  const days = lastDays(now, count);
  const totals = new Map(days.map((d) => [d, 0]));
  for (const item of items) {
    const key = dayKey(at(item));
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + value(item));
  }
  return days.map((day) => ({ day, value: totals.get(day) ?? 0 }));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-10-01` -> `1 Oct`. */
export function dayLabel(key: string): string {
  const [, month, day] = key.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

/**
 * Round, evenly spaced axis ticks from 0 to at least `max`: steps of 1, 2 or 5
 * times a power of ten, so labels read 0 / 2,000 / 4,000 and never 0 / 1,393.
 * `integer` keeps counts from ever getting a 0.5 tick.
 */
export function niceTicks(max: number, target = 4, integer = false): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  let step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  if (integer) step = Math.max(1, Math.round(step));
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top + step / 2; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return ticks;
}

/** 1,284 / 12.9K / 4.2M -- full digits until they stop being glanceable. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs < 10_000) return value.toLocaleString("en-US");
  if (abs < 1_000_000) return `${trimZero((value / 1_000).toFixed(1))}K`;
  return `${trimZero((value / 1_000_000).toFixed(1))}M`;
}

function trimZero(text: string): string {
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

/** The shop's own money format: `TSh 5,574`. */
export function formatTZS(value: number): string {
  return `TSh ${value.toLocaleString("en-US")}`;
}

/** `TSh 12.9K` for tiles and axes where width is tight. */
export function formatTZSCompact(value: number): string {
  return `TSh ${compactNumber(value)}`;
}

/**
 * "3 min", "5 h", "2 d" -- how long something has waited. Queues are sorted
 * and flagged by age, because a marketplace's worst failures are the quiet
 * ones that sit.
 */
export function ageLabel(since: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

/**
 * How a chart's values are written. A name rather than a function, because
 * charts are client components rendered from server pages, and a function
 * cannot cross that boundary -- only plain data can.
 */
export type ValueFormat = "count" | "tzs";

export function formatValue(kind: ValueFormat, value: number): string {
  return kind === "tzs" ? formatTZS(value) : value.toLocaleString("en-US");
}

/** The tighter form, for axis ticks where margin is scarce. */
export function formatAxisValue(kind: ValueFormat, value: number): string {
  return kind === "tzs" ? compactNumber(value) : value.toLocaleString("en-US");
}
