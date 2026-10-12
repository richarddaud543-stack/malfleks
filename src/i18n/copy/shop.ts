import type { Locale } from "../locale";

/**
 * The words of the shop itself: searching, a product, the labels on a
 * product's delivery. English and Swahili side by side, entry for entry.
 *
 * What a seller wrote -- a product's name and description, a shop's name, the
 * labels of its details -- is theirs and is shown as written, in either
 * language. Only MalFleks's own words are here.
 *
 * The Swahili was written by Claude on 4 Oct 2026 and is the owner's to
 * correct; keep each line saying what its English neighbour says.
 */
export const SHOP = {
  en: {
    search: {
      title: "Search",
      descriptionEmpty:
        "MalFleks's catalogue is still filling up — real shops in Tanzania list their own products here, each with its own delivery method.",
      description: (count: number) =>
        `Search ${count} products across every brand, branch and city on MalFleks — filter by brand, category, city, price and delivery method.`,
      headingStart: "Search the",
      headingAccent: "whole marketplace",
      introEmpty:
        "Every product from every brand branch across Tanzania will be searchable here, with the delivery method shown on each one.",
      intro:
        "Every product from every brand branch across Tanzania, in one place. Filter by city to see what is near you, or by delivery to see who brings it to your door themselves.",
      products: "Products",
      placeholder: "Search products, brands or cities…",
      inputLabel: "Search products, brands or cities",
      none: "No products found",
      count: (n: number) => `${n} product${n === 1 ? "" : "s"}`,
      filtersActive: (n: number) => `${n} filter${n === 1 ? "" : "s"} active`,
      filters: "Filters",
      sort: "Sort",
      sortLabel: "Sort results",
      sortOptions: {
        relevance: "Most relevant",
        "price-asc": "Price: low to high",
        "price-desc": "Price: high to low",
        name: "Name: A–Z",
      },
      facets: { brand: "Brand", category: "Category", city: "City", price: "Price (TZS)", delivery: "Delivery & stock" },
      priceBands: {
        "under-100k": "Under 100K",
        "100k-1m": "100K – 1M",
        "1m-10m": "1M – 10M",
        "10m-100m": "10M – 100M",
        "over-100m": "Over 100M",
      },
      brandDelivers: "Brand delivers it themselves",
      inStockOnly: "In stock only",
      clearAll: "Clear all",
      noMatchHeading: "Nothing matches that yet",
      noMatchBody: "Try a broader search, or clear a filter or two.",
      reset: "Reset search",
    },
    empty: {
      eyebrow: "MalFleks is new",
      /** "No products listed yet" -- `things` is one of the `looking` words below. */
      heading: (things: string) => `No ${things} listed yet`,
      looking: { products: "products", brands: "brands", branches: "branches", couriers: "couriers", agents: "delivery agents" },
      filtered:
        "Nothing matches — and there is nothing to match yet. MalFleks lists only businesses a person here has spoken to and checked, and we are still signing up the first of them.",
      plain:
        "MalFleks lists only businesses a person here has spoken to and checked, and we are still signing up the first of them. Nothing invented goes on this site, so until a real shop joins, this page stays empty.",
      invite: "If you run a shop or carry deliveries in Tanzania, this is the moment to be first.",
      apply: "Become a partner",
    },
    delivery: {
      brand: "Brand delivery",
      agent: "Local agent delivery",
      outOfStock: "Out of stock",
      noCourier: (city: string) => `No courier serves ${city}`,
      couriers: (n: number) => `${n} couriers`,
      ownFleet: (brand: string) => `${brand} own fleet`,
      eta: {
        sameDay: "Same-day",
        nextDay: "Next day",
        days: (n: number) => (n === 1 ? "1 day" : `${n} days`),
        todayTo: (days: string) => `Today – ${days}`,
        range: (min: number, max: number) => `${min}–${max} days`,
      },
      blockedOutOfStock: "This product is out of stock at its branch, so it can't be requested yet.",
      blockedNoCourier: "No delivery agent currently serves this branch's city, so this order can't be routed.",
    },
    product: {
      notFound: "Product not found",
      metaDescription: (product: string, brand: string, price: string, description: string) =>
        `${product} from ${brand} — ${price}. ${description}`,
      brands: "Brands",
      inStock: "In stock",
      outOfStock: "Out of stock",
      cannotOrder: "This can't be ordered right now",
      findSimilar: "Find something similar",
      order: "Order & choose delivery",
      availableAt: (branch: string) => `Available at ${branch}`,
      verifiedShop: "Verified shop",
      verifiedShopDetail: "MalFleks has checked this shop's business licence, TIN certificate and shop front.",
      noPhoto: "No photo yet",
      branchAt: (name: string, address: string) => `${name} is at ${address}`,
      branchIn: (name: string, city: string) => `${name} is in ${city}`,
      open: (hours: string) => `open ${hours}`,
    },
    gallery: {
      position: (n: number, of: number) => `photo ${n} of ${of}`,
      zoom: (name: string) => `Zoom in on ${name}`,
      failed: "This photo couldn't be loaded.",
      tapToZoom: "Tap to zoom",
      photosOf: (name: string) => `Photos of ${name}`,
      show: (n: number, of: number) => `Show photo ${n} of ${of}`,
      counter: (n: number, of: number) => `Photo ${n} of ${of}`,
      close: "Close",
      previous: "Previous",
      next: "Next",
      previousLabel: "Previous photo",
      nextLabel: "Next photo",
    },
  },
  sw: {
    search: {
      title: "Tafuta",
      descriptionEmpty:
        "Orodha ya bidhaa za MalFleks bado inajazwa — maduka halisi ya Tanzania huweka bidhaa zao hapa, kila moja na njia yake ya usafirishaji.",
      description: (count: number) =>
        `Tafuta kati ya bidhaa ${count} za kila chapa, tawi na mji kwenye MalFleks — chuja kwa chapa, aina, mji, bei na njia ya usafirishaji.`,
      headingStart: "Tafuta kwenye",
      headingAccent: "soko zima",
      introEmpty:
        "Kila bidhaa ya kila tawi la chapa kote Tanzania itaweza kutafutwa hapa, na njia ya usafirishaji itaonyeshwa kwenye kila moja.",
      intro:
        "Kila bidhaa ya kila tawi la chapa kote Tanzania, mahali pamoja. Chuja kwa mji uone kilicho karibu nawe, au kwa usafirishaji uone nani anakuletea mwenyewe mlangoni.",
      products: "Bidhaa",
      placeholder: "Tafuta bidhaa, chapa au mji…",
      inputLabel: "Tafuta bidhaa, chapa au mji",
      none: "Hakuna bidhaa iliyopatikana",
      count: (n: number) => `Bidhaa ${n}`,
      filtersActive: (n: number) => `vichujio ${n} vinatumika`,
      filters: "Vichujio",
      sort: "Panga",
      sortLabel: "Panga matokeo",
      sortOptions: {
        relevance: "Zinazofaa zaidi",
        "price-asc": "Bei: ndogo hadi kubwa",
        "price-desc": "Bei: kubwa hadi ndogo",
        name: "Jina: A–Z",
      },
      facets: { brand: "Chapa", category: "Aina", city: "Mji", price: "Bei (TZS)", delivery: "Usafirishaji na upatikanaji" },
      priceBands: {
        "under-100k": "Chini ya 100K",
        "100k-1m": "100K – 1M",
        "1m-10m": "1M – 10M",
        "10m-100m": "10M – 100M",
        "over-100m": "Zaidi ya 100M",
      },
      brandDelivers: "Chapa inaleta yenyewe",
      inStockOnly: "Zilizopo tu",
      clearAll: "Futa vyote",
      noMatchHeading: "Bado hakuna kinacholingana",
      noMatchBody: "Jaribu kutafuta kwa upana zaidi, au ondoa kichujio kimoja au viwili.",
      reset: "Anza upya",
    },
    empty: {
      eyebrow: "MalFleks ni mpya",
      heading: (things: string) => `Bado hakuna ${things} zilizoorodheshwa`,
      looking: { products: "bidhaa", brands: "chapa", branches: "matawi", couriers: "wasafirishaji", agents: "wasafirishaji" },
      filtered:
        "Hakuna kinacholingana — na bado hakuna cha kulinganisha. MalFleks inaorodhesha biashara ambazo mtu wetu ameongea nazo na kuzikagua tu, na bado tunasajili za kwanza.",
      plain:
        "MalFleks inaorodhesha biashara ambazo mtu wetu ameongea nazo na kuzikagua tu, na bado tunasajili za kwanza. Hakuna kitu cha kubuni kinachowekwa hapa, kwa hiyo mpaka duka halisi lijiunge, ukurasa huu unabaki mtupu.",
      invite: "Kama una duka au unasafirisha mizigo Tanzania, huu ndio wakati wa kuwa wa kwanza.",
      apply: "Jiunge kama mshirika",
    },
    delivery: {
      brand: "Chapa inaleta yenyewe",
      agent: "Msafirishaji wa mjini",
      outOfStock: "Imeisha",
      noCourier: (city: string) => `Hakuna msafirishaji ${city}`,
      couriers: (n: number) => `wasafirishaji ${n}`,
      ownFleet: (brand: string) => `Usafirishaji wa ${brand} yenyewe`,
      eta: {
        sameDay: "Siku hiyo hiyo",
        nextDay: "Siku inayofuata",
        days: (n: number) => `siku ${n}`,
        todayTo: (days: string) => `Leo – ${days}`,
        range: (min: number, max: number) => `siku ${min}–${max}`,
      },
      blockedOutOfStock: "Bidhaa hii imeisha kwenye tawi lake, kwa hiyo haiwezi kuagizwa kwa sasa.",
      blockedNoCourier: "Hakuna msafirishaji anayehudumia mji wa tawi hili kwa sasa, kwa hiyo oda hii haiwezi kupelekwa.",
    },
    product: {
      notFound: "Bidhaa haipatikani",
      metaDescription: (product: string, brand: string, price: string, description: string) =>
        `${product} kutoka ${brand} — ${price}. ${description}`,
      brands: "Chapa",
      inStock: "Ipo",
      outOfStock: "Imeisha",
      cannotOrder: "Haiwezi kuagizwa kwa sasa",
      findSimilar: "Tafuta inayofanana",
      order: "Agiza na uchague usafirishaji",
      availableAt: (branch: string) => `Inapatikana ${branch}`,
      verifiedShop: "Duka lililothibitishwa",
      verifiedShopDetail: "MalFleks imekagua leseni ya biashara, cheti cha TIN na mbele ya duka hili.",
      noPhoto: "Bado hakuna picha",
      branchAt: (name: string, address: string) => `${name} iko ${address}`,
      branchIn: (name: string, city: string) => `${name} iko ${city}`,
      open: (hours: string) => `hufunguliwa ${hours}`,
    },
    gallery: {
      position: (n: number, of: number) => `picha ${n} kati ya ${of}`,
      zoom: (name: string) => `Kuza picha ya ${name}`,
      failed: "Picha hii imeshindwa kufunguka.",
      tapToZoom: "Gusa kukuza",
      photosOf: (name: string) => `Picha za ${name}`,
      show: (n: number, of: number) => `Onyesha picha ${n} kati ya ${of}`,
      counter: (n: number, of: number) => `Picha ${n} kati ya ${of}`,
      close: "Funga",
      previous: "Iliyotangulia",
      next: "Inayofuata",
      previousLabel: "Picha iliyotangulia",
      nextLabel: "Picha inayofuata",
    },
  },
};

/**
 * The kinds of product, in Swahili. The kind is stored in English (it is what
 * search filters on); this is only how it is shown. A kind a seller made up
 * before the list existed has no entry and is shown as written.
 */
const CATEGORY_SW: Record<string, string> = {
  Smartphone: "Simu janja",
  Tablet: "Tableti",
  Laptop: "Kompyuta mpakato",
  Smartwatch: "Saa janja",
  Earbuds: "Spika za masikioni",
  Speaker: "Spika",
  "Power Bank": "Power bank",
  Router: "Ruta",
  "SIM Card": "Laini ya simu",
  Sedan: "Gari dogo (sedan)",
  SUV: "SUV",
  Pickup: "Pickup",
  Van: "Van",
  Phones: "Simu",
  "TVs & Audio": "TV na sauti",
  "Home appliances": "Vifaa vya nyumbani",
  Cars: "Magari",
  Motorcycles: "Pikipiki",
  Fashion: "Mavazi",
  Shoes: "Viatu",
  Beauty: "Urembo",
  Furniture: "Samani",
  "Food & Groceries": "Chakula na mahitaji",
  Tools: "Zana",
  Other: "Nyingine",
};

/** A product kind as shown to a reader of `locale`. */
export function categoryLabel(category: string, locale: Locale): string {
  return locale === "sw" ? (CATEGORY_SW[category] ?? category) : category;
}
