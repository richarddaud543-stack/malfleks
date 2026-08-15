"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

const links = [
  { href: "/search", label: "Search" },
  { href: "/brands", label: "Brands" },
  { href: "/locator", label: "Near Me" },
  { href: "/agents", label: "Delivery Agents" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-3 z-50 px-3 sm:top-4 sm:px-6">
      {/* Opaque, not translucent: the pill floats over content as the page
          scrolls, and at 90% the headings underneath showed through it and read
          as a rendering fault rather than a design. */}
      <nav className="shadow-float mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-full border border-border bg-background px-4 py-2.5 sm:px-5">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-display text-lg font-medium tracking-tight"
        >
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-lime" />
          Soko<span className="text-accent">.</span>
        </Link>

        <div className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-foreground/75 transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <span className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted">
            EN
          </span>
          <Link href="/locator" className="btn-pill btn-ink">
            Find a branch
          </Link>
          <Link href="/search" className="btn-pill btn-lime">
            Shop now
          </Link>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 lg:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          <motion.span
            animate={{ rotate: open ? 45 : 0, y: open ? 6 : 0 }}
            className="h-px w-5 bg-foreground"
          />
          <motion.span
            animate={{ opacity: open ? 0 : 1 }}
            className="h-px w-5 bg-foreground"
          />
          <motion.span
            animate={{ rotate: open ? -45 : 0, y: open ? -6 : 0 }}
            className="h-px w-5 bg-foreground"
          />
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shadow-float mx-auto mt-2 max-w-5xl overflow-hidden rounded-3xl border border-border bg-background lg:hidden"
          >
            <div className="flex flex-col gap-1 p-3">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/80 hover:bg-surface hover:text-foreground"
                >
                  {l.label}
                </Link>
              ))}
              <div className="mt-2 flex items-center gap-2 border-t border-border px-3 pt-3">
                <Link
                  href="/locator"
                  onClick={() => setOpen(false)}
                  className="btn-pill btn-ink flex-1"
                >
                  Find a branch
                </Link>
                <Link
                  href="/search"
                  onClick={() => setOpen(false)}
                  className="btn-pill btn-lime flex-1"
                >
                  Shop now
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
