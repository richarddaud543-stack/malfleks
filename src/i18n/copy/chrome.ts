/**
 * The words of the frame every page sits in: the bar at the top, the footer,
 * the sign-in control, and the two pages nobody means to reach (not found,
 * something went wrong).
 *
 * English and Swahili side by side, entry for entry. The Swahili was written
 * by Claude on 4 Oct 2026 and is the owner's to correct; keep each line
 * saying what its English neighbour says.
 */
export const CHROME = {
  en: {
    skip: "Skip to content",
    nav: {
      search: "Search",
      brands: "Brands",
      nearMe: "Near Me",
      agents: "Delivery Agents",
      findBranch: "Find a branch",
      shopNow: "Shop now",
      toggleMenu: "Toggle menu",
    },
    language: {
      /** What a screen reader calls the pair of buttons. */
      group: "Language",
      /** Each button's name, in its own language. */
      names: { sw: "Kiswahili", en: "English" },
      short: { sw: "SW", en: "EN" },
    },
    auth: {
      signIn: "Sign in",
      myOrders: "My orders",
      ordersFor: (firstName: string) => `${firstName} · Orders`,
      signOut: "Sign out",
      signingOut: "Signing out…",
      signOutFailed: "Sign out failed — you are still signed in. Try again.",
    },
    footer: {
      blurb: "Shop from brand branches across Tanzania and pay safely: MalFleks holds your money until your order arrives.",
      explore: "Explore",
      searchProducts: "Search products",
      allBrands: "All brands",
      agents: "Delivery agents",
      locator: "Branch locator",
      apply: "Become a partner",
      yourOrders: "Your orders",
      howItWorks: "How MalFleks works",
      paying: "Paying, delivery and refunds",
      contact: "Contact",
      terms: "Terms of use",
      privacy: "Privacy",
      legal:
        "Brand logos are trademarks of their respective owners, used here for identification only. MalFleks holds no stock; payment for a confirmed order is held by MalFleks until it is delivered.",
    },
    breadcrumb: "Breadcrumb",
    notFound: {
      title: "Page not found",
      heading: "We couldn't find that page",
      body: "The brand, branch or product you're looking for doesn't exist — it may have moved, or the link might be out of date.",
      search: "Search products",
      brands: "Browse all brands",
      home: "Home",
    },
    error: {
      eyebrow: "Oops",
      heading: "Something went wrong",
      body: "This page hit an unexpected error. You can try again, or head back to the brand catalog.",
      retry: "Try again",
      brands: "Browse all brands",
    },
  },
  sw: {
    skip: "Ruka hadi kwenye maudhui",
    nav: {
      search: "Tafuta",
      brands: "Chapa",
      nearMe: "Karibu Nami",
      agents: "Wasafirishaji",
      findBranch: "Tafuta tawi",
      shopNow: "Nunua sasa",
      toggleMenu: "Fungua au funga menyu",
    },
    language: {
      group: "Lugha",
      names: { sw: "Kiswahili", en: "English" },
      short: { sw: "SW", en: "EN" },
    },
    auth: {
      signIn: "Ingia",
      myOrders: "Oda zangu",
      ordersFor: (firstName: string) => `${firstName} · Oda`,
      signOut: "Toka",
      signingOut: "Unatoka…",
      signOutFailed: "Imeshindikana kutoka — bado umeingia. Jaribu tena.",
    },
    footer: {
      blurb: "Nunua kwenye matawi ya chapa kote Tanzania na ulipe kwa usalama: MalFleks inashikilia pesa yako mpaka mzigo wako ufike.",
      explore: "Vinjari",
      searchProducts: "Tafuta bidhaa",
      allBrands: "Chapa zote",
      agents: "Wasafirishaji",
      locator: "Tafuta tawi",
      apply: "Jiunge kama mshirika",
      yourOrders: "Oda zako",
      howItWorks: "Jinsi MalFleks inavyofanya kazi",
      paying: "Malipo, usafirishaji na kurudishiwa pesa",
      contact: "Wasiliana nasi",
      terms: "Masharti ya matumizi",
      privacy: "Faragha",
      legal:
        "Nembo za chapa ni alama za biashara za wamiliki wake, zimetumika hapa kwa utambulisho tu. MalFleks haina bidhaa; malipo ya oda iliyothibitishwa hushikiliwa na MalFleks mpaka mzigo ufike.",
    },
    breadcrumb: "Ulipo",
    notFound: {
      title: "Ukurasa haupatikani",
      heading: "Hatukuupata ukurasa huo",
      body: "Chapa, tawi au bidhaa unayotafuta haipo — huenda imehamishwa, au kiungo ni cha zamani.",
      search: "Tafuta bidhaa",
      brands: "Tazama chapa zote",
      home: "Mwanzo",
    },
    error: {
      eyebrow: "Samahani",
      heading: "Kuna hitilafu imetokea",
      body: "Ukurasa huu umepata hitilafu isiyotarajiwa. Unaweza kujaribu tena, au kurudi kwenye orodha ya chapa.",
      retry: "Jaribu tena",
      brands: "Tazama chapa zote",
    },
  },
};
