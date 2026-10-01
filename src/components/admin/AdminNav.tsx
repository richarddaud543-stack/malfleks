"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOut } from "@/app/actions/auth";
import type { NavCounts } from "@/server/admin/dashboard";

type IconName = "overview" | "orders" | "applications" | "submissions" | "money";

const ITEMS: { href: string; label: string; icon: IconName; count?: keyof NavCounts }[] = [
  { href: "/admin", label: "Overview", icon: "overview" },
  { href: "/admin/orders", label: "Orders", icon: "orders", count: "orders" },
  { href: "/admin/applications", label: "Applications", icon: "applications", count: "applications" },
  { href: "/admin/submissions", label: "Submissions", icon: "submissions", count: "submissions" },
  { href: "/admin/money", label: "Money", icon: "money", count: "payments" },
];

const ICON_PATHS: Record<IconName, string> = {
  overview: "M3 3h6v8H3zM11 3h6v5h-6zM11 10h6v7h-6zM3 13h6v4H3z",
  orders: "M4 4h12l-1 9H5zM7 16.5a1 1 0 1 0 0 .01M14 16.5a1 1 0 1 0 0 .01M2 2h2",
  applications: "M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 17c0-3 2.7-5 6-5s6 2 6 5",
  submissions: "M4 3h8l4 4v10H4zM12 3v4h4M7 11h6M7 14h4",
  money: "M3 6h14v9H3zM10 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 9h1M16 9h1",
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

/**
 * The console's navigation: a sidebar on wide screens, a scrolling row of
 * pills on a phone. Badges count only what is someone's job right now --
 * pending orders, applications, submissions, unpaid payment links -- so a
 * number in the sidebar always means "go here".
 */
export default function AdminNav({
  email,
  counts,
  shopUrl,
}: {
  email: string | null;
  counts: NavCounts | null;
  shopUrl: string;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="border-b border-border bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-5">
        <Link href="/admin" className="flex items-baseline gap-1.5 font-display text-lg font-medium tracking-tight">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-lime" />
          MalFleks
          <span className="text-xs font-normal tracking-normal text-muted">admin</span>
        </Link>
        <form action={signOut} className="lg:hidden">
          <button type="submit" className="text-xs font-medium text-muted hover:text-foreground">
            Sign out
          </button>
        </form>
      </div>

      <nav aria-label="Admin" className="lg:flex-1 lg:px-3">
        <ul className="flex gap-1.5 overflow-x-auto px-4 pb-3 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
          {ITEMS.map((item) => {
            const active = isActive(item.href);
            const count = item.count && counts ? counts[item.count] : 0;
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-accent text-white"
                      : "text-muted hover:bg-[#eef2f0] hover:text-foreground"
                  }`}
                >
                  <Icon name={item.icon} />
                  <span className="flex-1">{item.label}</span>
                  {count > 0 && (
                    <span
                      aria-label={`${count} waiting`}
                      className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums ${
                        active ? "bg-white/20 text-white" : "bg-lime text-lime-foreground"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="hidden border-t border-border px-5 py-4 text-xs lg:block">
        {email && (
          <p className="truncate text-muted" title={email}>
            {email}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between gap-3">
          <a href={shopUrl} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
            View shop ↗
          </a>
          <form action={signOut}>
            <button type="submit" className="font-medium text-muted hover:text-foreground">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
