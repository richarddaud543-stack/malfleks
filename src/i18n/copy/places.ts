/**
 * The words of the pages about who sells and who delivers: the brand list, a
 * brand, a branch, the couriers, and the branch locator. English and Swahili
 * side by side.
 *
 * The Swahili was written by Claude on 4 Oct 2026 and is the owner's to
 * correct; keep each line saying what its English neighbour says.
 */
export const PLACES = {
  en: {
    brands: {
      title: "All brands",
      heading: "All brands",
      introEmpty: "Brands list their own branches here, each with its own delivery status.",
      intro: "Every brand on MalFleks has its own branches across Tanzania, each with its own delivery status.",
      list: "Brands",
      loading: "Loading brands…",
      all: "All",
      categories: { automotive: "Automotive", electronics: "Electronics", telecom: "Telecom" },
      mix: {
        direct: "Delivers directly",
        courier: "Local courier delivery",
        all: (total: number) => `Delivers directly at all ${total} branches`,
        none: "No branches deliver directly",
        some: (delivering: number, total: number) => `${delivering} of ${total} branches deliver directly`,
      },
    },
    brand: {
      notFound: "Brand not found",
      shareTitle: (name: string) => `${name} on MalFleks`,
      crumb: "Brands",
      branches: (count: number) => `Branches (${count})`,
    },
    branch: {
      notFound: "Branch not found",
      offersDelivery: "Offers brand delivery.",
      usesCourier: "Connects to a local delivery agent.",
      noAddress: (brand: string) =>
        `We don't have a confirmed street address for this branch. Contact ${brand} to check where it is and when it opens before travelling.`,
      unverified: (brand: string) =>
        `We have not confirmed this branch's location against ${brand}'s own records. Check with them before travelling.`,
      products: "Products at this branch",
      noProducts: "No products listed at this branch yet.",
      addressNotPublished: "Exact address not published — confirm with the brand first",
    },
    locator: {
      title: "Branch locator",
      descriptionEmpty:
        "MalFleks's map fills up as real branches join — every brand at once, with the delivery agents covering each city.",
      description: (count: number, cities: string) =>
        `Find all ${count} brand branches across ${cities} on one map — every brand at once, with the delivery agents covering each city.`,
      headingStart: "What's",
      headingAccent: "near me",
      introEmpty:
        "Every brand branch in Tanzania will appear on one map here, with the courier that covers each city when the brand doesn't deliver itself.",
      intro:
        "Every brand branch in Tanzania on one map. Pick a city to see who has a counter there — and which courier covers it when the brand doesn't deliver itself.",
      mapHeading: "Map of Tanzania — choose a city",
      placeholder: "Search brand, city or branch…",
      inputLabel: "Search branches by brand, city or branch name",
      clearSearch: "Clear search",
      markerNote: "Marker size follows how many branches a city has.",
      allCities: "All cities",
      brand: "Brand",
      clearFilters: "Clear filters",
      none: "No branches match",
      count: (n: number) => `${n} branch${n === 1 ? "" : "es"}`,
      inCity: (city: string) => `in ${city}`,
      across: "across Tanzania",
      emptyHeading: "Nothing here yet",
      emptyBody: "No branch matches that combination — try another city or brand, or clear the search.",
      showAll: "Show every branch",
      whoDelivers: "Who delivers",
      where: "where",
      agentsNote: "Branches marked “Local agent delivery” are handed to one of these couriers.",
      noCourier: (city: string) => `No courier covers ${city} yet.`,
      confirmWith: (brand: string) => `Exact address not published — confirm with ${brand} first`,
      marker: (city: string, n: number) => `${city}, ${n} ${n === 1 ? "branch" : "branches"}`,
    },
    agents: {
      title: "Delivery agents",
      heading: "Delivery agents",
      intro: "When a branch can't deliver directly, these local couriers step in — filter by city to see who covers your area.",
      allCities: "All cities",
      list: "Couriers",
      noneInCity: "No agents found for this city yet.",
      loading: "Loading…",
      based: (city: string, regions: string) => `Based in ${city} · Serves ${regions}`,
      verified: "Verified",
      eta: (when: string) => `ETA: ${when}`,
      noNumber: "No published number — arranged through the branch",
    },
  },
  sw: {
    brands: {
      title: "Chapa zote",
      heading: "Chapa zote",
      introEmpty: "Chapa huorodhesha matawi yake hapa, kila tawi na hali yake ya usafirishaji.",
      intro: "Kila chapa iliyopo MalFleks ina matawi yake kote Tanzania, kila tawi na hali yake ya usafirishaji.",
      list: "Chapa",
      loading: "Chapa zinapakiwa…",
      all: "Zote",
      categories: { automotive: "Magari", electronics: "Elektroniki", telecom: "Mawasiliano" },
      mix: {
        direct: "Inaleta yenyewe",
        courier: "Kupitia msafirishaji wa mjini",
        all: (total: number) => `Matawi yote ${total} yanaleta yenyewe`,
        none: "Hakuna tawi linaloleta lenyewe",
        some: (delivering: number, total: number) => `Matawi ${delivering} kati ya ${total} yanaleta yenyewe`,
      },
    },
    brand: {
      notFound: "Chapa haipatikani",
      shareTitle: (name: string) => `${name} kwenye MalFleks`,
      crumb: "Chapa",
      branches: (count: number) => `Matawi (${count})`,
    },
    branch: {
      notFound: "Tawi halipatikani",
      offersDelivery: "Chapa inaleta yenyewe.",
      usesCourier: "Hutumia msafirishaji wa mjini.",
      noAddress: (brand: string) =>
        `Hatuna anwani ya mtaa iliyothibitishwa ya tawi hili. Wasiliana na ${brand} ujue lilipo na saa za kufunguliwa kabla hujaenda.`,
      unverified: (brand: string) =>
        `Hatujathibitisha mahali tawi hili lilipo kwa kumbukumbu za ${brand} yenyewe. Wasiliana nao kabla hujaenda.`,
      products: "Bidhaa za tawi hili",
      noProducts: "Bado hakuna bidhaa iliyoorodheshwa kwenye tawi hili.",
      addressNotPublished: "Anwani kamili haijawekwa — thibitisha na chapa kwanza",
    },
    locator: {
      title: "Tafuta tawi",
      descriptionEmpty:
        "Ramani ya MalFleks hujaa kadri matawi halisi yanavyojiunga — chapa zote kwa pamoja, na wasafirishaji wanaohudumia kila mji.",
      description: (count: number, cities: string) =>
        `Pata matawi yote ${count} ya chapa katika ${cities} kwenye ramani moja — chapa zote kwa pamoja, na wasafirishaji wanaohudumia kila mji.`,
      headingStart: "Kilicho",
      headingAccent: "karibu nami",
      introEmpty:
        "Kila tawi la chapa Tanzania litaonekana kwenye ramani moja hapa, pamoja na msafirishaji anayehudumia kila mji pale chapa isipoleta yenyewe.",
      intro:
        "Kila tawi la chapa Tanzania kwenye ramani moja. Chagua mji uone nani ana duka hapo — na msafirishaji gani anauhudumia pale chapa isipoleta yenyewe.",
      mapHeading: "Ramani ya Tanzania — chagua mji",
      placeholder: "Tafuta chapa, mji au tawi…",
      inputLabel: "Tafuta matawi kwa chapa, mji au jina la tawi",
      clearSearch: "Futa utafutaji",
      markerNote: "Ukubwa wa alama hufuata idadi ya matawi ya mji.",
      allCities: "Miji yote",
      brand: "Chapa",
      clearFilters: "Futa vichujio",
      none: "Hakuna tawi linalolingana",
      count: (n: number) => (n === 1 ? "Tawi 1" : `Matawi ${n}`),
      inCity: (city: string) => `${city}`,
      across: "kote Tanzania",
      emptyHeading: "Bado hakuna kitu hapa",
      emptyBody: "Hakuna tawi linalolingana na mchanganyiko huo — jaribu mji au chapa nyingine, au futa utafutaji.",
      showAll: "Onyesha matawi yote",
      whoDelivers: "Nani anasafirisha",
      where: "wapi",
      agentsNote: "Matawi yenye alama ya “Msafirishaji wa mjini” hukabidhiwa kwa mmoja wa wasafirishaji hawa.",
      noCourier: (city: string) => `Bado hakuna msafirishaji anayehudumia ${city}.`,
      confirmWith: (brand: string) => `Anwani kamili haijawekwa — thibitisha na ${brand} kwanza`,
      marker: (city: string, n: number) => `${city}, ${n === 1 ? "tawi 1" : `matawi ${n}`}`,
    },
    agents: {
      title: "Wasafirishaji",
      heading: "Wasafirishaji",
      intro: "Tawi lisipoweza kuleta lenyewe, wasafirishaji hawa wa mjini huchukua nafasi — chuja kwa mji uone nani anahudumia eneo lako.",
      allCities: "Miji yote",
      list: "Wasafirishaji",
      noneInCity: "Bado hakuna msafirishaji aliyepatikana kwa mji huu.",
      loading: "Inapakia…",
      based: (city: string, regions: string) => `Yuko ${city} · Anahudumia ${regions}`,
      verified: "Amethibitishwa",
      eta: (when: string) => `Muda: ${when}`,
      noNumber: "Hakuna namba iliyowekwa — hupangwa kupitia tawi",
    },
  },
};
