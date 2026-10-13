import { both } from "./email";

/**
 * The words the rulebook sends (`src/server/rules/`).
 *
 * Kept beside `email.ts` rather than in it only because that file is already
 * long. The conventions are the same: plain text, Swahili first and English
 * below for anyone who is not MalFleks (`both`), and every message written to
 * be the *only* one of its kind the reader gets about that order -- the rules
 * that send them claim a once-only mark first.
 *
 * The Swahili was written by Claude for the owner to correct, like the rest.
 */

type Message = { subject: string; body: string };

function money(amountTZS: number): string {
  return `TSh ${amountTZS.toLocaleString("en-US")}`;
}

function hello(name: string | null | undefined): string {
  return name ? `Hello ${name},` : "Hello,";
}

function habari(name: string | null | undefined): string {
  return name ? `Habari ${name},` : "Habari,";
}

/** "20 hours" / "3 days", for a sentence. */
function waitedEn(hours: number): string {
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.floor(hours / 24)} days`;
}

function waitedSw(hours: number): string {
  if (hours < 48) return `saa ${hours}`;
  return `siku ${Math.floor(hours / 24)}`;
}

// ---------------------------------------------------------------------------
// To the customer
// ---------------------------------------------------------------------------

interface PayInput {
  firstName: string | null;
  reference: string;
  productName: string;
  totalTZS: number;
  siteUrl: string;
}

/** An hour after ordering, still unpaid: one reminder, and the deadline said plainly. */
export function paymentReminderMessage(input: PayInput & { hoursLeft: number }): Message {
  const link = `${input.siteUrl}/pay/${encodeURIComponent(input.reference)}`;
  return both(
    {
      subject: `Oda yako ya MalFleks ${input.reference} inasubiri malipo`,
      body: [
        habari(input.firstName),
        "",
        `Oda yako ya ${input.productName} (kumbukumbu ${input.reference}) bado haijalipiwa.`,
        `Jumla ni ${money(input.totalTZS)}.`,
        "",
        "Lipa kwa pesa ya simu hapa:",
        link,
        "",
        `Isipolipiwa ndani ya saa ${input.hoursLeft} zijazo, oda hii itaghairiwa yenyewe.`,
        "Hutozwi chochote usipolipa.",
        "",
        "Hiki ndicho kikumbusho pekee tunachotuma kwa oda hii.",
      ].join("\n"),
    },
    {
      subject: `Your MalFleks order ${input.reference} is waiting for payment`,
      body: [
        hello(input.firstName),
        "",
        `Your order for ${input.productName} (reference ${input.reference}) has not been paid`,
        `for yet. The total is ${money(input.totalTZS)}.`,
        "",
        "Pay by mobile money here:",
        link,
        "",
        `If it is not paid within the next ${input.hoursLeft} hours, this order is cancelled`,
        "automatically. Nothing is charged unless you pay.",
        "",
        "This is the only reminder we send for this order.",
      ].join("\n"),
    },
  );
}

/** Payment could not be offered when the order was placed, and now it can. */
export function checkoutOpenMessage(input: PayInput): Message {
  const link = `${input.siteUrl}/pay/${encodeURIComponent(input.reference)}`;
  return both(
    {
      subject: `Sasa unaweza kulipia oda yako ya MalFleks ${input.reference}`,
      body: [
        habari(input.firstName),
        "",
        `Malipo hayakuwa yanapatikana ulipoweka oda yako ya ${input.productName}`,
        `(kumbukumbu ${input.reference}). Sasa yanafanya kazi tena. Tunaomba radhi kwa usumbufu.`,
        "",
        `Lipa ${money(input.totalTZS)} kwa pesa ya simu hapa:`,
        link,
        "",
        "MalFleks inashikilia malipo yako mpaka oda ifike. Isipoweza kufika,",
        "unarudishiwa pesa yako.",
      ].join("\n"),
    },
    {
      subject: `You can now pay for your MalFleks order ${input.reference}`,
      body: [
        hello(input.firstName),
        "",
        `Payment was not available when you placed your order for ${input.productName}`,
        `(reference ${input.reference}). It is working again. We are sorry for the trouble.`,
        "",
        `Pay ${money(input.totalTZS)} by mobile money here:`,
        link,
        "",
        "MalFleks holds your payment until the order is delivered. If it can't be",
        "delivered, you are refunded.",
      ].join("\n"),
    },
  );
}

// ---------------------------------------------------------------------------
// To the shop or courier
// ---------------------------------------------------------------------------

/**
 * A paid order that has not been delivered.
 *
 * `final: false` is the reminder a day after payment. `final: true` is the
 * last warning: it names how long is left, says what will happen, and -- the
 * part that matters -- tells the partner what to do if the order *was*
 * delivered and only the code is missing. A reported order is never cancelled
 * by the rulebook.
 */
export function deliveryOverdueMessage(input: {
  reference: string;
  productName: string;
  hoursWaiting: number;
  final: boolean;
  hoursLeft: number;
  siteUrl: string;
}): Message {
  const orders = `${input.siteUrl}/partner/orders`;
  if (!input.final) {
    return both(
      {
        subject: `MalFleks: oda ${input.reference} iliyolipiwa bado haijafika`,
        body: [
          `Oda ya ${input.productName} (kumbukumbu ${input.reference}) ililipiwa ${waitedSw(input.hoursWaiting)}`,
          "zilizopita na bado haijawekwa kuwa imefika.",
          "",
          "Mteja akishapokea mzigo, muombe namba yake ya tarakimu 6 na uiandike kwenye",
          "ukurasa wako wa oda. Hiyo ndiyo inayoruhusu ulipwe.",
          "",
          "Oda zako:",
          orders,
          "",
          "Kama kuna kinachozuia usafirishaji, toa taarifa kwenye ukurasa huo ili",
          "MalFleks isaidie.",
        ].join("\n"),
      },
      {
        subject: `MalFleks: paid order ${input.reference} is still not delivered`,
        body: [
          `The order for ${input.productName} (reference ${input.reference}) was paid for`,
          `${waitedEn(input.hoursWaiting)} ago and has not been marked delivered.`,
          "",
          "Once the customer has the goods, ask for their 6-digit code and enter it on",
          "your orders page. That is what releases your payment.",
          "",
          "Your orders:",
          orders,
          "",
          "If something is stopping the delivery, report it on that page so MalFleks",
          "can help.",
        ].join("\n"),
      },
    );
  }
  return both(
    {
      subject: `MalFleks: oda ${input.reference} itaghairiwa baada ya saa ${input.hoursLeft}`,
      body: [
        `Oda ya ${input.productName} (kumbukumbu ${input.reference}) ililipiwa ${waitedSw(input.hoursWaiting)}`,
        "zilizopita na bado haijawekwa kuwa imefika.",
        "",
        `Isipofikishwa na namba ya mteja kuandikwa ndani ya saa ${input.hoursLeft}, MalFleks itaighairi`,
        "na kumrudishia mteja pesa yake yote. Hutalipwa kwa oda hiyo.",
        "",
        "Kama IMESHAFIKA na huwezi kupata namba ya mteja, au kuna kikwazo kingine,",
        "toa taarifa ya tatizo kwenye ukurasa wako wa oda SASA. Oda iliyotolewa",
        "taarifa haighairiwi yenyewe; MalFleks huiangalia kwanza.",
        "",
        orders,
      ].join("\n"),
    },
    {
      subject: `MalFleks: order ${input.reference} will be cancelled in ${input.hoursLeft} hours`,
      body: [
        `The order for ${input.productName} (reference ${input.reference}) was paid for`,
        `${waitedEn(input.hoursWaiting)} ago and has still not been marked delivered.`,
        "",
        `If it is not delivered and the customer's code entered within ${input.hoursLeft} hours,`,
        "MalFleks will cancel it and refund the customer in full. You will not be",
        "paid for it.",
        "",
        "If it HAS been delivered and you cannot get the customer's code, or",
        "something else is in the way, report the problem on your orders page NOW.",
        "A reported order is not cancelled automatically; MalFleks looks at it first.",
        "",
        orders,
      ].join("\n"),
    },
  );
}

/** The rulebook cancelled a paid order for lateness: whoever was to deliver it must stop. */
export function orderCancelledPartnerMessage(input: { reference: string; productName: string; siteUrl: string }): Message {
  return both(
    {
      subject: `MalFleks: oda ${input.reference} imeghairiwa — usiipeleke`,
      body: [
        `Oda ya ${input.productName} (kumbukumbu ${input.reference}) haikuwekwa kuwa imefika kwa`,
        "wakati, kwa hiyo MalFleks imeighairi na mteja anarudishiwa pesa yake yote.",
        "",
        "Usiipeleke. Hakuna malipo kwa oda hii.",
        "",
        "Kama unaona hili ni kosa, wasiliana nasi:",
        `${input.siteUrl}/contact`,
      ].join("\n"),
    },
    {
      subject: `MalFleks: order ${input.reference} has been cancelled — do not deliver it`,
      body: [
        `The order for ${input.productName} (reference ${input.reference}) was not marked`,
        "delivered in time, so MalFleks has cancelled it and the customer is being",
        "refunded in full.",
        "",
        "Do not deliver it. There is no payment for this order.",
        "",
        "If you think this is a mistake, contact us:",
        `${input.siteUrl}/contact`,
      ].join("\n"),
    },
  );
}

/** A shop's products were taken off the shop after repeated failed paid orders. */
export function listingsHiddenMessage(input: { failures: number; windowDays: number; hidden: number; siteUrl: string }): Message {
  return both(
    {
      subject: "MalFleks: bidhaa zako zimeondolewa dukani kwa sasa",
      body: [
        `Oda ${input.failures} zilizolipiwa kutoka duka lako zimeghairiwa ndani ya siku ${input.windowDays}`,
        "zilizopita, kwa sababu zilikataliwa baada ya malipo au hazikufika kwa wakati.",
        "Kila mteja amerudishiwa pesa yake.",
        "",
        `Ili kuwalinda wateja, bidhaa zako ${input.hidden} zimefichwa dukani mpaka MalFleks`,
        "izungumze nawe. Hakuna kilichofutwa.",
        "",
        "Jibu barua pepe hii, au wasiliana nasi:",
        `${input.siteUrl}/contact`,
      ].join("\n"),
    },
    {
      subject: "MalFleks: your products have been taken off the shop for now",
      body: [
        `${input.failures} paid orders from your shop were cancelled in the last ${input.windowDays} days,`,
        "because they were declined after payment or not delivered in time. Each of",
        "those customers has been refunded.",
        "",
        `To protect customers, your ${input.hidden} product${input.hidden === 1 ? " is" : "s are"} hidden from the shop until`,
        "MalFleks has spoken with you. Nothing has been deleted.",
        "",
        "Reply to this email, or contact us:",
        `${input.siteUrl}/contact`,
      ].join("\n"),
    },
  );
}

/**
 * To a shop: MalFleks needs its three documents. Sent once, when the
 * verification rule first finds the shop unverified. Says why (customers pay
 * before they receive anything, and MalFleks tells them every shop is
 * checked), what to send, where, and the date after which its products come
 * off the shop.
 */
export function verificationNeededMessage(input: { shopName: string; deadline: string; siteUrl: string }): Message {
  return both(
    {
      subject: `MalFleks: tafadhali tuma nyaraka za ${input.shopName}`,
      body: [
        "MalFleks inawaambia wateja kwamba kila duka hapa limekaguliwa: wateja hulipa kabla",
        "ya kupokea mzigo, na wanahitaji kujua wanalipa biashara halisi.",
        "",
        "Tafadhali pakia nyaraka hizi tatu kwenye ukurasa wako wa mshirika:",
        "  1. Leseni ya biashara",
        "  2. Cheti cha TIN",
        "  3. Picha ya mbele ya duka lako",
        `${input.siteUrl}/partner`,
        "",
        "Hazionyeshwi kwa wateja wala kwa mtu yeyote nje ya MalFleks.",
        "",
        `Zisipofika na kukaguliwa kufikia ${input.deadline}, bidhaa zako zitafichwa dukani`,
        "mpaka zikaguliwe. Hakuna kitakachofutwa.",
      ].join("\n"),
    },
    {
      subject: `MalFleks: please send ${input.shopName}'s documents`,
      body: [
        "MalFleks tells customers that every shop here has been checked: they pay before",
        "they receive anything, and they need to know they are paying a real business.",
        "",
        "Please upload these three documents on your partner page:",
        "  1. Business licence",
        "  2. TIN certificate",
        "  3. A photo of your shop front",
        `${input.siteUrl}/partner`,
        "",
        "They are never shown to customers or to anyone outside MalFleks.",
        "",
        `If they have not arrived and been checked by ${input.deadline}, your products will be`,
        "hidden from the shop until they are. Nothing will be deleted.",
      ].join("\n"),
    },
  );
}

/** To a shop: its grace period ran out and its products are hidden until its documents are checked. */
export function verificationHiddenMessage(input: { shopName: string; hidden: number; siteUrl: string }): Message {
  return both(
    {
      subject: "MalFleks: bidhaa zako zimefichwa mpaka nyaraka zikaguliwe",
      body: [
        `Nyaraka za ${input.shopName} bado hazijakaguliwa, kwa hiyo bidhaa zako ${input.hidden}`,
        "zimefichwa dukani kwa sasa. Hakuna kilichofutwa.",
        "",
        "Pakia leseni ya biashara, cheti cha TIN na picha ya mbele ya duka hapa:",
        `${input.siteUrl}/partner`,
        "Zikishakaguliwa, bidhaa zako zinarudi dukani.",
      ].join("\n"),
    },
    {
      subject: "MalFleks: your products are hidden until your documents are checked",
      body: [
        `${input.shopName}'s documents have not been checked yet, so your ${input.hidden} product${input.hidden === 1 ? " is" : "s are"}`,
        "hidden from the shop for now. Nothing has been deleted.",
        "",
        "Upload your business licence, TIN certificate and shop-front photo here:",
        `${input.siteUrl}/partner`,
        "Once they are checked, your products come back.",
      ].join("\n"),
    },
  );
}

/**
 * To a delivery rider: MalFleks needs their driving licence. Sent once, when
 * the verification rule first finds the rider unverified.
 */
export function riderLicenceNeededMessage(input: { riderName: string; deadline: string; siteUrl: string }): Message {
  return both(
    {
      subject: "MalFleks: tafadhali tuma leseni yako ya udereva",
      body: [
        habari(input.riderName),
        "",
        "Kabla MalFleks haijamtuma msafirishaji mlangoni kwa mteja, mtu wa MalFleks hukagua leseni yake ya udereva.",
        "Tafadhali pakia picha safi ya leseni yako (upande wenye picha na jina lako) kwenye ukurasa wako wa mshirika:",
        `${input.siteUrl}/partner`,
        "",
        `Tafadhali itume kabla ya ${input.deadline}. Haionyeshwi kwa wateja wala kwa mtu yeyote nje ya MalFleks.`,
      ].join("\n"),
    },
    {
      subject: "MalFleks: please send your driving licence",
      body: [
        hello(input.riderName),
        "",
        "Before MalFleks sends a rider to a customer's door, a person at MalFleks checks their driving licence.",
        "Please upload a clear photo of yours (the side with your photo and name) on your partner page:",
        `${input.siteUrl}/partner`,
        "",
        `Please send it by ${input.deadline}. It is never shown to customers or to anyone outside MalFleks.`,
      ].join("\n"),
    },
  );
}

/** To a delivery rider: the date passed and MalFleks still does not have their licence. Sent once. */
export function riderLicenceReminderMessage(input: { riderName: string; siteUrl: string }): Message {
  return both(
    {
      subject: "MalFleks: bado tunahitaji leseni yako ya udereva",
      body: [
        habari(input.riderName),
        "",
        "Bado hatujapokea leseni yako ya udereva. Bila hiyo, MalFleks inaweza kuacha kukupa mizigo ya kupeleka.",
        "Tafadhali ipakie leo hapa:",
        `${input.siteUrl}/partner`,
      ].join("\n"),
    },
    {
      subject: "MalFleks: we still need your driving licence",
      body: [
        hello(input.riderName),
        "",
        "We still haven't received your driving licence. Without it, MalFleks may stop giving you deliveries.",
        "Please upload it today here:",
        `${input.siteUrl}/partner`,
      ].join("\n"),
    },
  );
}

// ---------------------------------------------------------------------------
// To the owner
// ---------------------------------------------------------------------------

export interface DailySummaryInput {
  /** e.g. "Fri 9 Oct". */
  day: string;
  ordersPlaced: number;
  ordersPaid: number;
  ordersDelivered: number;
  cancelledByRules: number;
  refundsSent: { count: number; totalTZS: number };
  payoutsSent: { count: number; totalTZS: number };
  /** Passes the fifteen-minute clock made in the last 24 hours (96 when healthy). */
  clockPasses: number;
  gateway: "up" | "down" | "not known";
  moneySending: "on" | "paused" | "off";
  rulebookPaused: boolean;
  openAlerts: { subject: string; urgency: string; handling: boolean }[];
  adminUrl: string;
}

/**
 * One email a morning: what the rules did yesterday, and what is waiting.
 * English only -- one person reads it. Sent every day, including a day when
 * nothing happened, because a summary that only arrives when there is news
 * cannot be told apart from a system that has stopped.
 */
export function dailySummaryMessage(input: DailySummaryInput): Message {
  const waiting = input.openAlerts.length;
  const lines = [
    `What MalFleks did by itself on ${input.day}:`,
    "",
    `  Orders placed:            ${input.ordersPlaced}`,
    `  Orders paid:              ${input.ordersPaid}`,
    `  Orders delivered:         ${input.ordersDelivered}`,
    `  Cancelled by the rules:   ${input.cancelledByRules}`,
    `  Refunds sent:             ${input.refundsSent.count}${input.refundsSent.count ? ` (${money(input.refundsSent.totalTZS)})` : ""}`,
    `  Payouts sent to partners: ${input.payoutsSent.count}${input.payoutsSent.count ? ` (${money(input.payoutsSent.totalTZS)})` : ""}`,
    "",
    "How the machinery is:",
    "",
    `  15-minute clock:  ${input.clockPasses === 0 ? "NOT RUNNING - no pass in the last 24 hours" : `${input.clockPasses} passes in the last 24 hours${input.clockPasses < 80 ? " (96 is normal - some were missed)" : ""}`}`,
    `  ClickPesa:        ${input.gateway === "down" ? "DOWN - customers cannot pay" : input.gateway}`,
    `  Sending money:    ${input.moneySending === "on" ? "on" : input.moneySending === "paused" ? "paused - refunds and payouts wait for you" : "off - refunds and payouts are sent by hand"}`,
    ...(input.rulebookPaused ? ["  Rules:            PAUSED - nothing is being cancelled, reminded or sent"] : []),
    "",
    waiting === 0 ? "Nothing is waiting for you." : `Waiting for you (${waiting}):`,
    ...input.openAlerts.map((a) => `  ${a.urgency === "urgent" ? "!" : "-"} ${a.subject}${a.handling ? " (you are handling it)" : ""}`),
    "",
    `${input.adminUrl}/admin/rules`,
  ];
  return {
    subject: `MalFleks daily: ${waiting === 0 ? "nothing needs you" : `${waiting} thing${waiting === 1 ? "" : "s"} waiting for you`}`,
    body: lines.join("\n"),
  };
}
