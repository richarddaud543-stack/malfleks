/**
 * The MalFleks promise, in one place.
 *
 * Agreed with the owner on 3 Oct 2026: MalFleks is the trusted middleman — it
 * holds the buyer's money until the order arrives, then pays the shop and the
 * courier. Every line here restates something `/terms#paying` already commits
 * to and the payment code already does (`settle.ts` captures to MalFleks,
 * payouts are split on fulfilment, a branch or MalFleks cancellation is a full
 * refund). Nothing here may promise more than that page does: no refund
 * timing, and nothing about a customer changing their mind, because that rule
 * is still the owner's to decide.
 *
 * Kept as data rather than JSX so the home scene, the light-theme card and
 * the tests all read the same words.
 */
export const PROMISE = {
  headline: "Your money is held until your order arrives",
  /** Swahili line shown under the headline. Wants a native speaker's check. */
  swahili: "Pesa yako inalindwa mpaka mzigo ufike.",
  points: [
    {
      title: "You pay MalFleks, not a stranger",
      body: "Your payment goes to MalFleks by mobile money, through ClickPesa. You never send money to a seller's personal number.",
    },
    {
      title: "The shop is paid after delivery",
      body: "MalFleks pays the branch and the courier their shares once your order has been delivered.",
    },
    {
      title: "Refunded in full if it can't be supplied",
      body: "If the branch or MalFleks cancels an order you have paid for, you get the full amount back.",
    },
  ],
  /** The plain-language page; the Terms' "Paying" section is linked from there. */
  link: { href: "/how-it-works", label: "How paying and refunds work" },
} as const;

/**
 * The same promise in Swahili, point for point. Used by the promise card
 * (`SafePay`) when the site is in Swahili; the English above is used when it
 * is in English. Written by Claude on 4 Oct 2026 for the owner to correct --
 * and held to the same rule: nothing here may promise more than the Terms do.
 */
export const PROMISE_SW = {
  headline: "Pesa yako inalindwa mpaka mzigo ufike",
  points: [
    {
      title: "Unalipa MalFleks, si mtu usiyemjua",
      body: "Malipo yako yanakwenda MalFleks kwa pesa ya simu, kupitia ClickPesa. Hutumi pesa kamwe kwenye namba binafsi ya muuzaji.",
    },
    {
      title: "Duka linalipwa baada ya mzigo kufika",
      body: "MalFleks inalilipa tawi na msafirishaji sehemu zao mzigo wako ukishafika.",
    },
    {
      title: "Unarudishiwa pesa yote isipopatikana",
      body: "Tawi au MalFleks ikighairi oda uliyoilipia, unarudishiwa kiasi chote.",
    },
  ],
  link: { href: "/how-it-works", label: "Jinsi malipo na kurudishiwa pesa kunavyofanya kazi" },
} as const;

/** The promise card's words in one language, and the one line shown in the other. */
export function promiseIn(locale: "en" | "sw") {
  return locale === "sw"
    ? { ...PROMISE_SW, other: PROMISE.headline, otherLang: "en" as const }
    : { headline: PROMISE.headline, points: PROMISE.points, link: PROMISE.link, other: PROMISE.swahili, otherLang: "sw" as const };
}
