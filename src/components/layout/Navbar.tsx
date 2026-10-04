"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import AuthMenu from "@/components/auth/AuthMenu";
import LanguageToggle from "@/components/layout/LanguageToggle";
import { useLocale } from "@/i18n/client";
import { CHROME } from "@/i18n/copy/chrome";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const copy = CHROME[useLocale()].nav;
  const links = [
    { href: "/search", label: copy.search },
    { href: "/brands", label: copy.brands },
    { href: "/locator", label: copy.nearMe },
    { href: "/agents", label: copy.agents },
  ];

  return (
    <header data-site-chrome="" className="sticky top-3 z-50 px-3 sm:top-4 sm:px-6">
      {/* Opaque, not translucent: the pill floats over content as the page
          scrolls, and at 90% the headings underneath showed through it and read
          as a rendering fault rather than a design. */}
      <nav className="shadow-float mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-full border border-border bg-background px-4 py-2.5 sm:px-5">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-display text-lg font-medium tracking-tight"
        >
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-lime" />
          MalFleks<span className="text-accent">.</span>
        </Link>

        <div className="hidden items-center gap-5 xl:gap-7 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="whitespace-nowrap text-sm font-medium text-foreground/75 transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <LanguageToggle />
          <AuthMenu />
          {/* From the widest screens only: with the language switch in the
              bar there is no room for both buttons at 1024px, and "Near me"
              in the links beside it already goes to the same page. */}
          {/* A wrapper, because `.btn-pill` sets its own `display` and would
              win over a `hidden` on the link itself. */}
          <span className="hidden xl:inline-flex">
            <Link href="/locator" className="btn-pill btn-ink">
              {copy.findBranch}
            </Link>
          </span>
          <Link href="/search" className="btn-pill btn-lime">
            {copy.shopNow}
          </Link>
        </div>

        {/* Search is what most people came to do, so on a phone it stays in
            view beside the menu button instead of one tap behind it. */}
        <Link
          href="/search"
          onClick={() => setOpen(false)}
          className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-foreground/80 hover:text-foreground lg:hidden"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.5 13.5 3.5 3.5" />
          </svg>
          {/* The word goes on the narrowest phones, where the language switch
              needs the room; the link keeps its name for a screen reader. */}
          <span className="sr-only min-[400px]:not-sr-only">{copy.search}</span>
        </Link>

        {/* The language switch is in the bar itself on every screen size: a
            reader who cannot read the page must not have to open a menu,
            labelled in that same language, to change it. */}
        <LanguageToggle className="lg:hidden" />

        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-11 w-11 flex-col items-center justify-center gap-1.5 lg:hidden"
          aria-label={copy.toggleMenu}
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
                  className="flex min-h-11 items-center rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/80 hover:bg-surface hover:text-foreground"
                >
                  {l.label}
                </Link>
              ))}
              <div className="mt-2 flex items-center gap-2 border-t border-border px-3 pt-3">
                <AuthMenu compact onNavigate={() => setOpen(false)} />
              </div>
              <div className="flex items-center gap-2 px-3 pt-2">
                <Link
                  href="/locator"
                  onClick={() => setOpen(false)}
                  className="btn-pill btn-ink flex-1"
                >
                  {copy.findBranch}
                </Link>
                <Link
                  href="/search"
                  onClick={() => setOpen(false)}
                  className="btn-pill btn-lime flex-1"
                >
                  {copy.shopNow}
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
