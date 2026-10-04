import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque, Instrument_Serif } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import SiteAnalytics from "@/components/layout/SiteAnalytics";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/site-identity";
import { resolveSiteUrl } from "@/lib/site-url";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const displayFont = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const accentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const siteUrl = resolveSiteUrl();

/**
 * What every page says about itself to a browser tab, a search engine and a
 * chat app, unless the page says something more specific.
 *
 * - **Title and description** carry the promise (`site-identity.ts`). They
 *   described a brand directory until 4 Oct 2026, a day after the site itself
 *   had moved on.
 * - **`alternates.canonical: "./"`** gives every page a canonical address: its
 *   own path on the public site, with no query string. Next resolves the
 *   relative value against each page's own route, so this one line covers
 *   them all -- `/search?q=earbuds` and `/search` are told to be one page.
 * - **Open Graph and Twitter** are what a pasted link turns into. The picture
 *   comes from `app/opengraph-image.tsx`; a product with a photo overrides it.
 * - **Icons and the manifest** come from `app/icon.tsx`, `app/apple-icon.tsx`
 *   and `app/manifest.ts` and need nothing here.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: SITE_TITLE,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "./",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  // Tells a phone not to turn the references and prices on a page into
  // tappable "phone numbers". Real numbers on the site are proper tel: links.
  formatDetection: { telephone: false },
};

/** The colour a phone's browser bar takes: the page ground, so the site reads as one surface. */
export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} ${accentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[1000] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-background"
        >
          Skip to content
        </a>
        {/* No smooth-scroll script and no grain overlay since 4 Oct 2026. Both
            were dressing for the dark home page: the first put an animation
            library on every page of a site read mostly on phones, the second
            a full-screen filter over all of it. */}
        <Navbar />
        {/* tabIndex={-1} is what makes the skip link actually skip: without a
            focusable target the browser scrolls but leaves focus on <body>,
            so the next Tab returns to the nav the user just skipped. */}
        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <Footer />
        {/* Vercel Web Analytics. Same root layout serves both the public
            `malfleks` deployment and the hostname-gated `malfleks-admin`
            one, so this one addition covers both — the script reports to
            whichever Vercel project the running deployment belongs to,
            resolved from Vercel's own build-time environment, never
            configured here. A no-op locally and on any non-Vercel host.
            `SiteAnalytics` takes order references out of the page addresses
            before a visit is counted -- see the privacy notice. */}
        <SiteAnalytics />
      </body>
    </html>
  );
}
