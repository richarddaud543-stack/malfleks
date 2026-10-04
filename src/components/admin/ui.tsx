import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The console's small vocabulary of layout pieces, so every page reads the
 * same: a header, tiles, sections, tables, badges, empty states, paging.
 * Server components only — no state here. Interactive bits are in
 * `ActionForm.tsx`.
 */

export function PageHeader({
  title,
  description,
  back,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="text-xs font-medium text-muted hover:text-accent">
            ← {back.label}
          </Link>
        )}
        {eyebrow && <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">{eyebrow}</div>}
        <h1 className="mt-1 font-display text-2xl font-medium tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Tiles({ children, className = "lg:grid-cols-4" }: { children: ReactNode; className?: string }) {
  return <ul className={`mt-6 grid grid-cols-2 gap-2 ${className}`}>{children}</ul>;
}

export function Tile({
  label,
  value,
  note,
  emphasis,
  title,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  emphasis?: boolean;
  /** Full value, when `value` is shortened. */
  title?: string;
}) {
  return (
    <li className={`rounded-xl border bg-white px-4 py-3 ${emphasis ? "border-accent" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums sm:text-2xl" title={title}>
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </li>
  );
}

export function Section({
  id,
  title,
  note,
  actions,
  children,
  className = "mt-8",
}: {
  id: string;
  title: string;
  note?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className={className}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={`${id}-heading`} className="text-sm font-semibold uppercase tracking-wide text-muted">
            {title}
          </h2>
          {note && <p className="mt-1 text-xs text-muted">{note}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-white ${className}`}>{children}</div>;
}

/** A horizontally scrolling table frame. Columns stay readable on a phone instead of crushing. */
export function TableFrame({ children, minWidth = 720 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="relative mt-3 overflow-x-auto rounded-xl border border-border bg-white">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, align = "left", className = "" }: { children?: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <th scope="col" className={`px-4 py-2.5 text-xs font-medium text-muted ${align === "right" ? "text-right" : ""} ${className}`}>
      {children}
    </th>
  );
}

const BADGE: Record<string, string> = {
  // Orders
  pending: "bg-[#fab219]/15 text-[#6b4a00]",
  confirmed: "bg-[#6a4bc4]/10 text-[#3d2690]",
  fulfilled: "bg-[#0ca30c]/10 text-[#006300]",
  cancelled: "bg-[#d03b3b]/10 text-[#9b1c1c]",
  // Money
  captured: "bg-[#0ca30c]/10 text-[#006300]",
  paid: "bg-[#0ca30c]/10 text-[#006300]",
  failed: "bg-[#d03b3b]/10 text-[#9b1c1c]",
  owed: "bg-[#fab219]/15 text-[#6b4a00]",
  // Partners and products
  active: "bg-[#0ca30c]/10 text-[#006300]",
  live: "bg-[#0ca30c]/10 text-[#006300]",
  suspended: "bg-[#d03b3b]/10 text-[#9b1c1c]",
  hidden: "bg-[#5e6b66]/15 text-[#2c3431]",
  "out of stock": "bg-[#fab219]/15 text-[#6b4a00]",
  "not live": "bg-[#5e6b66]/15 text-[#2c3431]",
};

/** Status chip. Always words, never colour alone. */
export function Badge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold first-letter:uppercase ${
        BADGE[status] ?? "bg-border/40 text-muted"
      }`}
    >
      {label ?? status}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-muted">{children}</p>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger"; children: ReactNode }) {
  const styles = {
    info: "border-border bg-white",
    warn: "border-[#fab219]/60 bg-[#fab219]/10",
    danger: "border-[#d03b3b]/40 bg-[#d03b3b]/5",
  }[tone];
  return (
    <div role={tone === "info" ? undefined : "status"} className={`mt-4 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

/** Builds `?a=1&b=2` from the current filters, dropping empties and overriding with `patch`. */
export function hrefWith(base: string, current: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...patch })) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function Pager({
  base,
  current,
  page,
  pages,
  total,
  noun,
}: {
  base: string;
  current: Record<string, string | undefined>;
  page: number;
  pages: number;
  total: number;
  noun: string;
}) {
  if (pages <= 1) return <p className="mt-3 text-xs text-muted tabular-nums">{total} {noun}</p>;
  const link = "rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium hover:border-accent";
  return (
    <nav aria-label="Pages" className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
      <span className="tabular-nums">
        {total} {noun} · page {page} of {pages}
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link className={link} href={hrefWith(base, current, { page: String(page - 1) })}>
            ← Newer
          </Link>
        )}
        {page < pages && (
          <Link className={link} href={hrefWith(base, current, { page: String(page + 1) })}>
            Older →
          </Link>
        )}
      </span>
    </nav>
  );
}

/** Definition list in two columns on wide screens. */
export function Facts({ items }: { items: { label: string; value: ReactNode; wide?: boolean }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className={item.wide ? "sm:col-span-2" : undefined}>
          <dt className="text-xs text-muted">{item.label}</dt>
          <dd className="mt-0.5 break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * "Toyota Tanzania — Dar es Salaam" already names its city; adding ", Dar es
 * Salaam" again reads as a typo. Only append the city when the name lacks it.
 */
export function placeLabel(branchName: string, city: string): string {
  return branchName.toLowerCase().includes(city.toLowerCase()) ? branchName : `${branchName}, ${city}`;
}

/** "1 payout", "3 payouts". */
export function plural(count: number, noun: string, many = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : many}`;
}

export const inputClass =
  "mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-accent";
export const labelClass = "block text-xs font-medium text-muted";
