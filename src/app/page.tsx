import type { Metadata } from "next";

import HomePage from "@/components/home/HomePage";
import { languageAlternates } from "@/lib/site-copy";

// The title, description and share picture are the site's own (the root
// layout); this adds only where the same page is in Swahili.
export const metadata: Metadata = { alternates: languageAlternates("home") };

/** The home page in English. The page itself is `HomePage`; `/sw` is the same page in Swahili. */
export default function Home() {
  return <HomePage locale="en" />;
}
