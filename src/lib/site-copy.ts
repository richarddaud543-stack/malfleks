import type { Question, Step } from "./how-it-works";
import { BUYER_STEPS, COURIER_STEPS, QUESTIONS, SELLER_STEPS } from "./how-it-works";
import type { Locale } from "@/i18n/locale";
import { PROMISE } from "./promise";
import { SITE_DESCRIPTION, SITE_TITLE } from "./site-identity";

/**
 * The words of the two pages MalFleks publishes in both languages -- the home
 * page and "How MalFleks works" -- in English and in Swahili.
 *
 * ## Why this file looks the way it does
 *
 * These were the first two pages written in both languages, and the pages a
 * person reads to decide whether to trust MalFleks. The rest of the site's
 * words are in `src/i18n/copy/`, one file per area, in the same shape.
 *
 * The English side is not written here: it is read from `promise.ts` and
 * `how-it-works.ts`, the same constants the English pages always used, so
 * there is still exactly one English text. The Swahili side sits beside it,
 * entry for entry, and `site-copy.test.ts` holds the two to the same shape:
 * the same number of steps and questions, the same links, nothing said in one
 * language that the other leaves out.
 *
 * ## The Swahili is a draft until the owner has read it
 *
 * Written by Claude on 4 Oct 2026 for the owner, a native speaker, to
 * correct. It follows the word choices already made in `PROMISE.swahili`
 * ("pesa", "mzigo") and plain Tanzanian usage: "oda" for an order, "duka"
 * for the shop, "msafirishaji" for the courier, "pesa ya simu" for mobile
 * money. Change the words freely -- but keep each entry saying what its
 * English neighbour says, because every English line restates something the
 * Terms commit to.
 */
export interface SiteCopy {
  /** The home page's title and description, for the browser tab, search engines and a pasted link. */
  homeMeta: { title: string; description: string };
  hero: {
    /** The headline without its last word, and that last word, which takes the accent face. */
    headline: string;
    headlineAccent: string;
    /** The promise in the other language, shown under the headline. */
    secondLine: string;
    secondLineLang: Locale;
    body: string;
    search: string;
    howItWorks: string;
  };
  moneyPath: {
    caption: string;
    stops: readonly [Step, Step, Step];
    refund: string;
  };
  products: { heading: string; all: string };
  steps: { heading: string; items: readonly Step[]; more: string };
  shops: { heading: string; delivering: (cities: string) => string; and: string; find: string };
  openingSoon: { heading: string; body: string };
  partners: { heading: string; body: string; action: string };
  howItWorks: {
    title: string;
    /** The headline of a pasted link to this page. */
    shareTitle: string;
    description: string;
    eyebrow: string;
    lead: string;
    buying: { heading: string; intro: string; steps: readonly Step[] };
    actions: { search: string; locator: string };
    questions: { heading: string; items: readonly Question[] };
    selling: { heading: string; intro: string; steps: readonly Step[] };
    delivering: { heading: string; intro: string; steps: readonly Step[] };
    stepLabel: (n: number) => string;
    apply: string;
    /** "The full rules are in the {terms}, and what we keep about you is in the {privacy}." */
    footnote: { before: string; terms: string; between: string; privacy: string; after: string };
  };
}

const en: SiteCopy = {
  homeMeta: { title: SITE_TITLE, description: SITE_DESCRIPTION },
  hero: {
    headline: PROMISE.headline.replace(/\s+arrives$/, ""),
    headlineAccent: "arrives",
    secondLine: PROMISE.swahili,
    secondLineLang: "sw",
    body: "Shop from real shops in your city. You pay MalFleks by mobile money, and the shop is paid only after delivery.",
    search: "Search products",
    howItWorks: "How it works",
  },
  moneyPath: {
    caption: "How your payment moves when you buy on MalFleks",
    stops: [
      { title: "You pay MalFleks", body: "By mobile money. Never to a seller's personal number." },
      { title: "MalFleks holds your money", body: "While the shop gets your order to you." },
      { title: "The shop is paid", body: "Only after your order has been delivered." },
    ],
    refund: "If the shop cannot supply your order, you get the full amount back.",
  },
  products: { heading: "In the shops now", all: "See all products" },
  steps: { heading: "How buying works", items: BUYER_STEPS, more: "Questions about paying, delivery and refunds" },
  shops: {
    heading: "Shops on MalFleks",
    delivering: (cities) => `Delivering in ${cities}. Each shop delivers within its own city.`,
    and: "and",
    find: "Find a shop near you",
  },
  openingSoon: {
    heading: "The first shops are joining now",
    body: "There is nothing to buy here yet. Shops and couriers are applying, and each one is checked by a person before it appears.",
  },
  partners: {
    heading: "Run a shop or a delivery service?",
    body: "Your customers pay before you deliver, and MalFleks pays you after. No chasing money at the door.",
    action: "Become a partner",
  },
  howItWorks: {
    title: "How MalFleks works",
    shareTitle: "How MalFleks works — pay safely",
    description:
      "How buying on MalFleks works: you pay MalFleks by mobile money, we hold your money, and the shop is paid only after your order reaches you. Questions answered.",
    eyebrow: "Pay safely",
    lead: "You pay MalFleks. We hold your money. The shop is paid only after your order reaches you.",
    buying: { heading: "Buying", intro: "Four steps, and your money is never in a stranger's hands.", steps: BUYER_STEPS },
    actions: { search: "Search products", locator: "Find a shop near you" },
    questions: { heading: "Questions people ask", items: QUESTIONS },
    selling: {
      heading: "Selling through MalFleks",
      intro: "For a shop: customers who have already paid, and no chasing money after delivery.",
      steps: SELLER_STEPS,
    },
    delivering: {
      heading: "Delivering for MalFleks",
      intro: "For a courier: orders in your own city, paid for before you set off.",
      steps: COURIER_STEPS,
    },
    stepLabel: (n) => `STEP ${n}`,
    apply: "Become a partner",
    footnote: {
      before: "The full rules are in the ",
      terms: "terms of use",
      between: ", and what we keep about you is in the ",
      privacy: "privacy notice",
      after: ".",
    },
  },
};

const SW_BUYER_STEPS: readonly Step[] = [
  {
    title: "Tafuta unachohitaji",
    body: "Tafuta kwenye maduka ya mji wako. Kila bidhaa inaonyesha duka linaloiuza, bei yake, na nani atakuletea.",
  },
  {
    title: "Agiza, kisha lipa MalFleks",
    body: "Ingia, andika jina lako, namba ya simu na mahali pa kuletewa, kisha lipa kwa pesa ya simu. Unalipa MalFleks, kamwe si namba binafsi ya muuzaji.",
  },
  {
    title: "Tunashikilia pesa yako",
    body: "Duka linaambiwa umelipa na linaandaa mzigo wako. Pesa yako inabaki kwa MalFleks wakati mzigo uko njiani.",
  },
  {
    title: "Mzigo unafika, kisha duka linalipwa",
    body: "Mzigo wako ukishafika, MalFleks inalilipa duka na msafirishaji sehemu zao. Si kabla ya hapo.",
  },
];

const SW_SELLER_STEPS: readonly Step[] = [
  {
    title: "Omba kujiunga",
    body: "Tueleze kuhusu duka lako. Mtu wa MalFleks husoma kila ombi na kukujibu kwa barua pepe.",
  },
  {
    title: "Weka bidhaa zako",
    body: "Ongeza kila bidhaa pamoja na bei, maelezo na picha halisi. Tunakagua kila bidhaa kabla wateja hawajaiona.",
  },
  {
    title: "Fikisha kilicholipiwa",
    body: "Unajulishwa mteja akishalipa. Fikisha mzigo mwenyewe, au kupitia msafirishaji wa mji wako, na usipokee pesa yoyote mlangoni.",
  },
  {
    title: "Lipwa baada ya kufikisha",
    body: "Mzigo ukishathibitishwa kuwa umefika, MalFleks inakulipa sehemu yako. MalFleks hubaki na ada ya huduma kwa kila mauzo.",
  },
];

const SW_COURIER_STEPS: readonly Step[] = [
  {
    title: "Omba kujiunga",
    body: "Tuambie unafanya kazi mji gani. Mtu wa MalFleks husoma kila ombi na kukujibu kwa barua pepe.",
  },
  {
    title: "Beba mizigo iliyolipiwa",
    body: "Duka la mji wako lisipofikisha mizigo lenyewe, mteja huchagua msafirishaji. Unaiona oda ikishalipiwa.",
  },
  {
    title: "Usipokee pesa mlangoni",
    body: "Mteja ameshalipa MalFleks. Fikisha mzigo, kisha uthibitishe kuwa umefika.",
  },
  {
    title: "Lipwa baada ya kufikisha",
    body: "MalFleks inakulipa sehemu yako ya ada ya usafirishaji mzigo ukishafika.",
  },
];

const SW_QUESTIONS: readonly Question[] = [
  {
    question: "Je, ni salama kulipa kabla mzigo haujafika?",
    answer:
      "Ndiyo. Unalipa MalFleks, si muuzaji. MalFleks inashikilia pesa yako na kulilipa duka baada tu ya mzigo wako kufika. Duka likishindwa kukupatia mzigo, oda inafutwa na unarudishiwa pesa yako yote.",
  },
  {
    question: "Ninalipaje?",
    answer:
      "Kwa pesa ya simu. Unapoagiza, MalFleks inafungua ukurasa wa malipo unaoendeshwa na ClickPesa, mtoa huduma wetu wa malipo, na unathibitisha malipo kwenye simu yako. MalFleks haioni kamwe namba yako ya siri ya pesa ya simu.",
  },
  {
    question: "Je, nalipa chochote mlangoni?",
    answer:
      "Hapana. Kiasi unachokiona kabla ya kulipa ndicho kiasi kamili, pamoja na usafirishaji pale msafirishaji anapobeba mzigo. Kama umelipa kupitia MalFleks, usimlipe tena duka wala msafirishaji.",
  },
  {
    question: "Itakuwaje duka likishindwa kunipatia mzigo?",
    answer: "Oda inafutwa na unarudishiwa kiasi chote ulicholipa. Tunakutumia barua pepe pesa ikisharudishwa.",
  },
  {
    question: "Itakuwaje mzigo wangu usipofika?",
    answer:
      "Tuandikie pamoja na namba ya kumbukumbu ya oda yako. Duka hulipwa kwa mzigo uliofika tu, kwa hiyo pesa yako bado iko kwa MalFleks wakati tunalishughulikia.",
    link: { href: "/contact", label: "Wasiliana na MalFleks" },
  },
  {
    question: "Je, naweza kughairi oda?",
    answer:
      "Oda ambayo hujailipia unaweza kuighairi mwenyewe kwenye ukurasa wa oda zako; hutozwi chochote. Kama umeshalipa, bonyeza “Omba kughairi” hapo mapema iwezekanavyo. Mtu wa MalFleks atawasiliana na duka na kukutumia barua pepe kuhusu oda na malipo yako.",
    link: { href: "/account", label: "Oda zako" },
  },
  {
    question: "Je, nahitaji akaunti?",
    answer:
      "Si kwa kuangalia tu. Ili kuagiza unaingia kwa akaunti yako ya Google, ili MalFleks ipokee malipo yako, ihifadhi oda yako na ikuonyeshe mzigo ulipofika.",
  },
  {
    question: "MalFleks inafikisha mizigo wapi?",
    answer:
      "Kila duka hufikisha mizigo ndani ya mji wake, kwa hiyo unaagiza kwenye duka la mji uliopo. Fomu ya oda inakuuliza anwani yako iko mji gani kabla hujalipa.",
    link: { href: "/locator", label: "Tafuta duka karibu nawe" },
  },
  {
    question: "Je, MalFleks ndiyo inayouza bidhaa?",
    answer:
      "Hapana. Bidhaa zinauzwa na duka, kwa bei iliyowekwa na duka. MalFleks haina bidhaa: inapokea malipo yako, inayashikilia, inalipelekea duka oda yako, na kulilipa duka baada ya mzigo kufika.",
  },
  {
    question: "Ninawezaje kuuza au kusafirisha kupitia MalFleks?",
    answer: "Omba kujiunga kama duka au kama msafirishaji. Kila ombi husomwa na mtu.",
    link: { href: "/apply", label: "Jiunge kama mshirika" },
  },
];

const sw: SiteCopy = {
  homeMeta: {
    title: "MalFleks — Pesa yako inalindwa mpaka mzigo ufike",
    description:
      "Nunua kwenye maduka halisi Tanzania na ulipe kwa usalama kwa pesa ya simu. MalFleks inashikilia malipo yako mpaka mzigo wako ufike.",
  },
  hero: {
    headline: "Pesa yako inalindwa mpaka mzigo",
    headlineAccent: "ufike",
    secondLine: PROMISE.headline,
    secondLineLang: "en",
    body: "Nunua kwenye maduka halisi ya mji wako. Unalipa MalFleks kwa pesa ya simu, na duka linalipwa baada tu ya mzigo kukufikia.",
    search: "Tafuta bidhaa",
    howItWorks: "Jinsi inavyofanya kazi",
  },
  moneyPath: {
    caption: "Jinsi malipo yako yanavyosafiri unaponunua kupitia MalFleks",
    stops: [
      { title: "Unalipa MalFleks", body: "Kwa pesa ya simu. Kamwe si kwenye namba binafsi ya muuzaji." },
      { title: "MalFleks inashikilia pesa yako", body: "Wakati duka linakuletea mzigo wako." },
      { title: "Duka linalipwa", body: "Baada tu ya mzigo wako kufika." },
    ],
    refund: "Duka likishindwa kukupatia mzigo wako, unarudishiwa pesa yako yote.",
  },
  products: { heading: "Madukani sasa", all: "Tazama bidhaa zote" },
  steps: { heading: "Jinsi ya kununua", items: SW_BUYER_STEPS, more: "Maswali kuhusu malipo, usafirishaji na kurudishiwa pesa" },
  shops: {
    heading: "Maduka yaliyopo MalFleks",
    delivering: (cities) => `Tunafikisha mizigo ${cities}. Kila duka hufikisha mizigo ndani ya mji wake.`,
    and: "na",
    find: "Tafuta duka karibu nawe",
  },
  openingSoon: {
    heading: "Maduka ya kwanza yanajiunga sasa",
    body: "Bado hakuna cha kununua hapa. Maduka na wasafirishaji wanaomba kujiunga, na kila mmoja hukaguliwa na mtu kabla ya kuonekana.",
  },
  partners: {
    heading: "Una duka au huduma ya usafirishaji?",
    body: "Wateja wako wanalipa kabla hujapeleka mzigo, na MalFleks inakulipa baada ya kufikisha. Hakuna kudai pesa mlangoni.",
    action: "Jiunge kama mshirika",
  },
  howItWorks: {
    title: "Jinsi MalFleks inavyofanya kazi",
    shareTitle: "Jinsi MalFleks inavyofanya kazi — lipa kwa usalama",
    description:
      "Jinsi ya kununua kupitia MalFleks: unalipa MalFleks kwa pesa ya simu, tunashikilia pesa yako, na duka linalipwa baada tu ya mzigo wako kukufikia. Maswali na majibu.",
    eyebrow: "Lipa kwa usalama",
    lead: "Unalipa MalFleks. Tunashikilia pesa yako. Duka linalipwa baada tu ya mzigo wako kukufikia.",
    buying: { heading: "Kununua", intro: "Hatua nne, na pesa yako haiwi kamwe mikononi mwa mtu usiyemjua.", steps: SW_BUYER_STEPS },
    actions: { search: "Tafuta bidhaa", locator: "Tafuta duka karibu nawe" },
    questions: { heading: "Maswali yanayoulizwa mara kwa mara", items: SW_QUESTIONS },
    selling: {
      heading: "Kuuza kupitia MalFleks",
      intro: "Kwa duka: wateja waliokwisha kulipa, bila kufuatilia pesa baada ya kufikisha mzigo.",
      steps: SW_SELLER_STEPS,
    },
    delivering: {
      heading: "Kusafirisha kupitia MalFleks",
      intro: "Kwa msafirishaji: mizigo ya mji wako, iliyokwisha kulipiwa kabla hujaondoka.",
      steps: SW_COURIER_STEPS,
    },
    stepLabel: (n) => `HATUA ${n}`,
    apply: "Jiunge kama mshirika",
    footnote: {
      before: "Kanuni kamili ziko kwenye ",
      terms: "masharti ya matumizi",
      between: ", na tunachohifadhi kukuhusu kiko kwenye ",
      privacy: "taarifa ya faragha",
      after: ".",
    },
  },
};

export const SITE_COPY: Record<Locale, SiteCopy> = { en, sw };
