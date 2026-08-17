import type { Metadata } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque, Instrument_Serif } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import SmoothScrollProvider from "@/components/motion/SmoothScrollProvider";
import GrainOverlay from "@/components/motion/GrainOverlay";
import FirebaseAnalytics from "@/components/firebase/FirebaseAnalytics";
import FirebaseAppCheck from "@/components/firebase/FirebaseAppCheck";
import ConsentBanner from "@/components/consent/ConsentBanner";

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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Soko — Brands, branches and delivery in one place",
    template: "%s — Soko",
  },
  description:
    "Browse authorized brand branches across Tanzania and get every order delivered, by the brand or a local courier.",
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
        {/* Mounted here, second only to the skip link, though it is positioned
            at the bottom of the viewport: DOM order is tab order, and a
            consent choice a keyboard user only reaches after every link on the
            page is not really a choice. */}
        <ConsentBanner />
        <GrainOverlay />
        {/* Before FirebaseAnalytics, and before anything that signs in: App
            Check has to be attached to the Firebase app ahead of the SDK calls
            it attests. */}
        <FirebaseAppCheck />
        {/* Starts nothing until ConsentBanner has been answered "Allow". */}
        <FirebaseAnalytics />
        <SmoothScrollProvider>
          <Navbar />
          {/* tabIndex={-1} is what makes the skip link actually skip: without a
              focusable target the browser scrolls but leaves focus on <body>,
              so the next Tab returns to the nav the user just skipped. */}
          <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <Footer />
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
