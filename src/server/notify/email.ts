import { MALFLEKS_CONTACT_EMAIL } from "@/lib/contact";

/**
 * Telling a human that something happened.
 *
 * Until this existed, nothing anywhere in MalFleks told anyone about anything. A
 * shop could apply to be listed and a customer could send an order request,
 * and both would sit in a database until somebody thought to open `/admin` and
 * look. That is the failure that quietly kills a new marketplace: the first
 * partner applies, hears nothing for four days, and concludes the site is
 * abandoned — which, from where they are standing, it was.
 *
 * ## Three rules this module keeps
 *
 * **1. A failed email never fails the user's action.** Every function here
 * returns a result and throws nothing. An order request that was written to
 * the database *happened*, and the customer must be told it happened, whether
 * or not a third-party API answered a moment later. Callers `await` this only
 * so the serverless function does not exit mid-request; they ignore the
 * outcome on purpose.
 *
 * **2. Not configured is a normal state, not an error.** With no
 * `RESEND_API_KEY` the site runs exactly as before and sends nothing. Local
 * development, CI and preview deployments all sit in that state, and none of
 * them should be emailing anybody.
 *
 * **3. Notifications carry as little as they can.** These messages say what
 * arrived and where to read it — never the customer's phone number or address.
 * Email is not encrypted in transit end to end, it sits in an inbox for years,
 * and the details are one click away in `/admin` behind a real session. A
 * notification is a nudge, not a copy of the record.
 *
 * ## Two providers, and why
 *
 * MalFleks is run from Tanzania, and on 2026-09-01 the owner could not open
 * resend.com at all: `ERR_CONNECTION_TIMED_OUT`. The cause was specific and
 * measurable — resend.com resolves to `76.76.21.22` (Vercel's legacy anycast
 * address) on every public resolver, and that one address does not route from
 * that network. `api.resend.com`, `github.com`, `vercel.com` and MalFleks's own
 * deployment were all reachable at the same moment. Nothing was wrong with
 * Resend; one IP on one path was unreachable, and it happened to be the one
 * serving the signup page.
 *
 * That is not a fixable bug, and it is not rare either — a marketplace built in
 * a country with filtered or partial routing should not have a single
 * third-party dashboard as a hard dependency. So this module speaks to two
 * providers and picks whichever one has a key:
 *
 *   * `RESEND_API_KEY` — Resend. Sends from `onboarding@resend.dev` with no
 *     domain set up, but only to the address that owns the account, which is
 *     exactly this case.
 *   * `BREVO_API_KEY` — Brevo. Its dashboard *was* reachable from that network
 *     when Resend's was not, its free tier is 300 emails a day, and it needs
 *     the sender address verified once by clicking a link.
 *
 * Resend wins if both are set, for no better reason than that it was here
 * first — two configured providers means somebody is mid-migration, and
 * sending twice would be worse than either choice.
 *
 * The API hosts only ever have to be reachable **from the deployment**, not
 * from whoever is signing up: these calls run on Vercel. The signup page is the
 * only part that has to open in the owner's own browser.
 *
 * `MALFLEKS_NOTIFY_EMAIL` overrides where they go; `NOTIFY_FROM` (or the older
 * `RESEND_FROM`) overrides the sender once a domain is verified.
 */

/** Where notifications go. Overridable, but never empty. */
export function notifyAddress(env: Record<string, string | undefined> = process.env): string {
  // `?.trim() ||` rather than `??`: an env var set to "" is the empty-string
  // trap that cost this project three deployments. `??` does not catch it.
  return env.MALFLEKS_NOTIFY_EMAIL?.trim() || MALFLEKS_CONTACT_EMAIL;
}

/** Which provider to use, or `null` when none is configured. */
export type NotifyProvider = "resend" | "brevo";

export function notifyProvider(
  env: Record<string, string | undefined> = process.env,
): NotifyProvider | null {
  // `?.trim() ||` rather than `??` throughout this file: an env var set to ""
  // is the empty-string trap that cost this project three deployments, and it
  // looks identical to a set one in a dashboard. `??` does not catch it.
  if (env.RESEND_API_KEY?.trim()) return "resend";
  if (env.BREVO_API_KEY?.trim()) return "brevo";
  return null;
}

/**
 * Who they come from.
 *
 * The default only works on Resend — `onboarding@resend.dev` is Resend's own
 * shared sender. Brevo has no equivalent: it requires a sender you have
 * verified, so a Brevo deployment must set `NOTIFY_FROM` to that address. The
 * error surfaces as `rejected` rather than silence, which is the right shape
 * for a setting somebody forgot.
 */
export function notifySender(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    env.NOTIFY_FROM?.trim() ||
    env.RESEND_FROM?.trim() ||
    "MalFleks <onboarding@resend.dev>"
  );
}

export function isEmailConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return notifyProvider(env) !== null;
}

/**
 * Split `"MalFleks <hello@example.com>"` into a name and an address.
 *
 * Resend takes the combined form; Brevo wants `{ name, email }`. Parsing here
 * means one `NOTIFY_FROM` works for both and nobody has to remember which
 * provider wants which shape.
 */
export function parseSender(value: string): { name?: string; email: string } {
  const match = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(value);
  if (!match) return { email: value.trim() };
  const name = match[1].replace(/^"|"$/g, "").trim();
  return name ? { name, email: match[2].trim() } : { email: match[2].trim() };
}

export type NotifyResult =
  | { sent: true }
  | { sent: false; reason: "not-configured" | "rejected" | "failed" };

/**
 * Send one plain-text message. Never throws.
 *
 * Plain text rather than HTML on purpose: these are operational nudges read on
 * a phone, and an HTML email is a template to keep in step with the facts for
 * no gain.
 */
export async function sendNotification(
  subject: string,
  body: string,
  env: Record<string, string | undefined> = process.env,
): Promise<NotifyResult> {
  return sendEmail(notifyAddress(env), subject, body, env);
}

/** Loose on purpose: this only keeps obvious junk out of a provider call, it does not validate an address. */
const EMAIL_SHAPE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/**
 * Send one plain-text message to a customer. Never throws.
 *
 * Separate from `sendNotification` only in who receives it: that one goes to
 * MalFleks's own inbox, this one to the address a customer signed in with.
 * The address comes from `Order.customerEmail`, which was taken from the
 * verified session -- so this never mails an address somebody typed into a
 * form, which is what would make it usable to send MalFleks-branded mail to a
 * stranger.
 */
export async function sendCustomerEmail(
  to: string | null | undefined,
  subject: string,
  body: string,
  env: Record<string, string | undefined> = process.env,
): Promise<NotifyResult | { sent: false; reason: "no-address" }> {
  const address = to?.trim();
  if (!address || !EMAIL_SHAPE.test(address)) return { sent: false, reason: "no-address" };
  return sendEmail(address, subject, body, env);
}

/**
 * Send one plain-text message to a partner, or to someone applying to be one.
 * Never throws.
 *
 * The same guard and the same transport as `sendCustomerEmail`, under its own
 * name for one reason: who is being written to is the first thing a reader of
 * a call site needs to know, and a test that counts customer emails should not
 * have to subtract the ones that went to a branch. The address is always
 * `PartnerApplication.email`, which came from the applicant's verified session
 * -- see `src/server/notify/events.ts` for the lookup.
 */
export async function sendPartnerEmail(
  to: string | null | undefined,
  subject: string,
  body: string,
  env: Record<string, string | undefined> = process.env,
): Promise<NotifyResult | { sent: false; reason: "no-address" }> {
  const address = to?.trim();
  if (!address || !EMAIL_SHAPE.test(address)) return { sent: false, reason: "no-address" };
  return sendEmail(address, subject, body, env);
}

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  env: Record<string, string | undefined>,
): Promise<NotifyResult> {
  const provider = notifyProvider(env);
  if (!provider) return { sent: false, reason: "not-configured" };

  const from = parseSender(notifySender(env));

  // Typed explicitly: an inferred union of two object literals gives each
  // branch `undefined`-valued keys from the other, which `HeadersInit` rejects.
  const request: {
    url: string;
    headers: Record<string, string>;
    body: unknown;
  } =
    provider === "resend"
      ? {
          url: "https://api.resend.com/emails",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY?.trim()}`,
            "Content-Type": "application/json",
          },
          body: {
            from: from.name ? `${from.name} <${from.email}>` : from.email,
            to: [to],
            subject,
            text: body,
          },
        }
      : {
          url: "https://api.brevo.com/v3/smtp/email",
          headers: {
            "api-key": env.BREVO_API_KEY?.trim() ?? "",
            "Content-Type": "application/json",
            accept: "application/json",
          },
          body: {
            sender: from,
            to: [{ email: to }],
            subject,
            textContent: body,
          },
        };

  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
    });

    // A rejected key, or a sender the provider will not send as, comes back as
    // a 4xx with a JSON body. Distinguished from a network failure because the
    // two need different fixes — one is a setting, the other is a retry.
    if (!response.ok) return { sent: false, reason: "rejected" };
    return { sent: true };
  } catch {
    return { sent: false, reason: "failed" };
  }
}

/** A business has asked to be listed. */
export function partnerApplicationMessage(input: {
  kind: string;
  businessName: string;
  city: string;
  /**
   * The admin console's own origin (`resolveAdminUrl()`), not the shop's.
   * `/admin` is only served on the admin host, so a link on the public host
   * is a 404 in the one inbox that most needs it to work.
   */
  adminUrl: string;
}): { subject: string; body: string } {
  const what = input.kind === "courier" ? "courier" : "brand branch";
  return {
    subject: `MalFleks: ${input.businessName} applied (${what})`,
    body: [
      `${input.businessName} in ${input.city} has applied to join MalFleks as a ${what}.`,
      "",
      "Nothing is listed until you approve it, and approving does not put them",
      "on the map either — that is still a separate step after you have",
      "confirmed their address.",
      "",
      `Review it: ${input.adminUrl}/admin/applications`,
      "",
      "The applicant's phone number and notes are on that page rather than in",
      "this email.",
    ].join("\n"),
  };
}

/** A customer has sent an order request to a branch. */
export function orderRequestMessage(input: {
  reference: string;
  /**
   * Optional because `createOrder` returns the reference and nothing else, and
   * a second database read on the hot path of an order — purely to make an
   * email prettier — is the wrong trade. When it is absent the notification
   * still says the one thing that matters: something arrived, here is where.
   */
  productName?: string;
  /** The admin console's own origin -- see `partnerApplicationMessage`. */
  adminUrl: string;
  /**
   * The customer was sent straight to the pay page (the normal case since
   * 3 Oct 2026). Nobody has to confirm anything; the order confirms itself
   * when it is paid, and a separate email says so.
   */
  awaitingPayment?: boolean;
}): { subject: string; body: string } {
  if (input.awaitingPayment) {
    return {
      subject: `MalFleks: new order ${input.reference} — waiting for payment`,
      body: [
        input.productName ? `${input.productName} — reference ${input.reference}` : `Reference ${input.reference}`,
        "",
        "The customer has been taken to the pay page. There is nothing to do",
        "yet: when they pay, the order confirms itself, the branch is told to",
        "deliver, and you get a payment email. If they never pay, it shows in",
        "the daily list of stuck orders.",
        "",
        `Open it: ${input.adminUrl}/admin/orders`,
      ].join("\n"),
    };
  }
  return {
    subject: `MalFleks: new order request ${input.reference}`,
    body: [
      input.productName
        ? `${input.productName} — reference ${input.reference}`
        : `Reference ${input.reference}`,
      "",
      "A customer is waiting. The branch has been emailed and can confirm it",
      "themselves from their orders page. If they have not by tomorrow, ring",
      "them to check stock and price and confirm it here -- either way,",
      "confirming opens the checkout for the customer and emails them the link.",
      "Nothing is charged until they pay.",
      "",
      `Open it: ${input.adminUrl}/admin/orders`,
      "",
      "The customer's name, phone number and address are on that page rather",
      "than in this email.",
    ].join("\n"),
  };
}

function money(amountTZS: number): string {
  return `TSh ${amountTZS.toLocaleString("en-US")}`;
}

/** To the customer: the branch has confirmed, the checkout is open. */
export function paymentReadyMessage(input: {
  firstName: string | null;
  reference: string;
  productName: string;
  quantity: number;
  branchName: string;
  totalTZS: number;
  siteUrl: string;
}): { subject: string; body: string } {
  return {
    subject: `Your MalFleks order ${input.reference} is confirmed — pay to complete it`,
    body: [
      input.firstName ? `Hello ${input.firstName},` : "Hello,",
      "",
      `${input.branchName} has confirmed your order:`,
      `${input.quantity} × ${input.productName} — ${money(input.totalTZS)} in total.`,
      "",
      "Pay by mobile money here:",
      `${input.siteUrl}/pay/${encodeURIComponent(input.reference)}`,
      "",
      "MalFleks holds your payment until the order is delivered. If it can't be",
      "delivered, you are refunded.",
      "",
      `Your reference is ${input.reference}. If you did not place this order, ignore`,
      "this email — nothing is charged unless you pay.",
    ].join("\n"),
  };
}

/** To the customer: the money arrived. */
export function paymentReceivedMessage(input: {
  firstName: string | null;
  reference: string;
  productName: string;
  amountTZS: number;
  paymentReference: string;
  siteUrl: string;
}): { subject: string; body: string } {
  return {
    subject: `Payment received for your MalFleks order ${input.reference}`,
    body: [
      input.firstName ? `Hello ${input.firstName},` : "Hello,",
      "",
      `We have received ${money(input.amountTZS)} for ${input.productName}.`,
      `Order reference: ${input.reference}`,
      `Payment reference: ${input.paymentReference}`,
      "",
      "MalFleks holds this payment until your order is delivered.",
      "",
      "Follow your delivery here:",
      `${input.siteUrl}/track/${encodeURIComponent(input.reference)}`,
      "",
      "Keep this email as your receipt.",
    ].join("\n"),
  };
}

/** To MalFleks's own inbox: money in. */
export function paymentReceivedAdminMessage(input: {
  reference: string;
  amountTZS: number;
  adminUrl: string | null;
}): { subject: string; body: string } {
  return {
    subject: `MalFleks: ${money(input.amountTZS)} received for ${input.reference}`,
    body: [
      `${money(input.amountTZS)} has been collected for order ${input.reference} and is held in escrow.`,
      "",
      "Next: get it delivered, then mark it fulfilled so the branch and courier",
      "shares are worked out.",
      ...(input.adminUrl ? ["", `Open Money: ${input.adminUrl}/admin/money`] : []),
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// To a business applying to join
// ---------------------------------------------------------------------------
//
// Until 3 Oct 2026 an applicant heard nothing after pressing "apply": the
// decision was written to the database and they found out by signing in and
// looking, or not at all. Each message below says one thing and gives one
// place to go.

function greeting(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hello ${first},` : "Hello,";
}

/** To the applicant: approved. Approval is an account, not a listing -- the email must not imply otherwise. */
export function applicationApprovedMessage(input: {
  contactName: string | null;
  businessName: string;
  kind: string;
  siteUrl: string;
}): { subject: string; body: string } {
  const courier = input.kind === "courier";
  return {
    subject: `MalFleks: ${input.businessName} is approved`,
    body: [
      greeting(input.contactName),
      "",
      `Your application for ${input.businessName} has been approved, and the account`,
      "you applied with is now your partner account.",
      "",
      courier
        ? "One step is left before customers can pick you: we confirm which cities you cover and add you to the delivery routing. We will email you when that is done."
        : "One step is left before customers can find you: we confirm your address and opening hours and put your branch on the map. We will email you when that is done.",
      "",
      "Open your partner page:",
      `${input.siteUrl}/partner`,
    ].join("\n"),
  };
}

/** To the applicant: not approved, and why. */
export function applicationRejectedMessage(input: {
  contactName: string | null;
  businessName: string;
  reason: string | null;
  siteUrl: string;
}): { subject: string; body: string } {
  return {
    subject: `MalFleks: your application for ${input.businessName}`,
    body: [
      greeting(input.contactName),
      "",
      `We could not approve the application for ${input.businessName} this time.`,
      ...(input.reason ? ["", `The reason: ${input.reason}`] : []),
      "",
      "If that can be put right, you are welcome to apply again:",
      `${input.siteUrl}/apply`,
    ].join("\n"),
  };
}

/** To the partner: the branch is on the map, or the courier is in the routing. */
export function partnerActivatedMessage(input: {
  contactName: string | null;
  businessName: string;
  kind: string;
  siteUrl: string;
}): { subject: string; body: string } {
  const courier = input.kind === "courier";
  return {
    subject: courier
      ? `MalFleks: ${input.businessName} is now offered to customers`
      : `MalFleks: ${input.businessName} is on the map`,
    body: [
      greeting(input.contactName),
      "",
      courier
        ? `${input.businessName} has been added to the delivery routing. Customers ordering from a branch in your area can now pick you to deliver.`
        : `${input.businessName} is now on the MalFleks map, so customers can find the branch and order from it.`,
      "",
      courier ? "Your delivery jobs will appear here:" : "List your first product here:",
      courier ? `${input.siteUrl}/partner/orders` : `${input.siteUrl}/partner/products/new`,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// To a partner
// ---------------------------------------------------------------------------
//
// Rule 3 at the top of this file holds here too: an order email names the
// reference and the product, never the customer's name, phone or address.
// Those are on `/partner/orders`, behind the partner's own session.

/** To the branch: a customer's order is waiting for them to confirm it. */
export function branchNewOrderMessage(input: {
  reference: string;
  productName: string;
  quantity: number;
  siteUrl: string;
}): { subject: string; body: string } {
  return {
    subject: `MalFleks: new order ${input.reference} — please confirm`,
    body: [
      `A customer has asked for ${input.quantity} × ${input.productName}.`,
      `Reference: ${input.reference}`,
      "",
      "Nothing has been paid yet. If you have it at the listed price, confirm",
      "the order and the customer is asked to pay. If you can't supply it, say",
      "so and they are told straight away.",
      "",
      "Confirm or decline it here:",
      `${input.siteUrl}/partner/orders`,
    ].join("\n"),
  };
}

/** To the branch, once: an order has waited a day without an answer. */
export function branchOrderReminderMessage(input: {
  reference: string;
  productName: string;
  siteUrl: string;
}): { subject: string; body: string } {
  return {
    subject: `MalFleks: order ${input.reference} is still waiting for you`,
    body: [
      `The order for ${input.productName} (reference ${input.reference}) has been`,
      "waiting more than a day for your answer. The customer can't pay until",
      "you confirm it.",
      "",
      "Confirm it, or tell us you can't supply it:",
      `${input.siteUrl}/partner/orders`,
      "",
      "This is the only reminder we send for this order.",
    ].join("\n"),
  };
}

/**
 * To whoever has to act once the customer has paid.
 *
 * `deliver` -- the branch, when it runs its own delivery.
 * `collect` -- the courier, on an agent route: fetch it from the branch.
 * `hand-over` -- the branch, on an agent route: have it ready for the courier.
 */
export function orderPaidPartnerMessage(input: {
  role: "deliver" | "collect" | "hand-over";
  reference: string;
  productName: string;
  quantity: number;
  /** The branch, as the courier needs it named. */
  branchName: string;
  /** The courier, as the branch needs them named. */
  carrier: string;
  siteUrl: string;
}): { subject: string; body: string } {
  const what = `${input.quantity} × ${input.productName}`;
  const subject =
    input.role === "hand-over"
      ? `MalFleks: order ${input.reference} is paid — hand it to the courier`
      : `MalFleks: order ${input.reference} is paid — deliver now`;
  const next =
    input.role === "deliver"
      ? ["Please deliver it now. Collect nothing at the door -- MalFleks holds the", "payment and pays your share once you mark the order delivered.", "", "If you cannot supply it, press \"Can't fulfil\" on your orders page straight", "away so the customer is refunded."]
      : input.role === "collect"
        ? [`Please collect it from ${input.branchName} and deliver it now. Collect nothing at`, "the door -- MalFleks holds the payment and pays your share once you mark", "the order delivered."]
        : [`Please have it ready for ${input.carrier}, who is delivering it. MalFleks holds`, "the payment and pays your share once the courier marks the order", "delivered.", "", "If you cannot supply it, press \"Can't fulfil\" on your orders page straight", "away so the customer is refunded."];
  return {
    subject,
    body: [
      `The customer has paid for ${what}.`,
      `Reference: ${input.reference}`,
      "",
      ...next,
      "",
      "The customer's name, number and address are on your orders page:",
      `${input.siteUrl}/partner/orders`,
    ].join("\n"),
  };
}

/** To the branch: a product they submitted is on sale. */
export function productPublishedMessage(input: {
  productName: string;
  /** The live product's id, when it is known -- the link then goes to its own page. */
  productId: string | null;
  siteUrl: string;
}): { subject: string; body: string } {
  return {
    subject: `MalFleks: ${input.productName} is now on sale`,
    body: [
      `${input.productName} has been published and customers can order it.`,
      "",
      input.productId ? "See it on the shop:" : "See your listings:",
      input.productId
        ? `${input.siteUrl}/products/${encodeURIComponent(input.productId)}`
        : `${input.siteUrl}/partner`,
      "",
      "If it sells out, mark it out of stock from your partner page so nobody",
      "orders something you can't supply.",
    ].join("\n"),
  };
}

/** To the branch: a product they submitted was sent back, and why. */
export function productSentBackMessage(input: {
  productName: string;
  reason: string | null;
  siteUrl: string;
}): { subject: string; body: string } {
  return {
    subject: `MalFleks: ${input.productName} was sent back`,
    body: [
      `${input.productName} has not been published.`,
      ...(input.reason ? ["", `The reason: ${input.reason}`] : []),
      "",
      "Fix that and submit it again here:",
      `${input.siteUrl}/partner/products/new`,
    ].join("\n"),
  };
}

/** To the partner: MalFleks has sent them money. */
export function payoutSentMessage(input: {
  amountTZS: number;
  payoutReference: string;
  /** How many delivered orders this payout covers. */
  orderCount: number;
  siteUrl: string;
}): { subject: string; body: string } {
  return {
    subject: `MalFleks: ${money(input.amountTZS)} sent to you (${input.payoutReference})`,
    body: [
      `MalFleks has sent you ${money(input.amountTZS)}${
        input.orderCount > 0 ? ` for ${input.orderCount} delivered ${input.orderCount === 1 ? "order" : "orders"}` : ""
      }.`,
      `Payout reference: ${input.payoutReference}`,
      "",
      "It was sent to the mobile money number MalFleks has for you. If it has",
      "not arrived by tomorrow, tell us and quote the reference above:",
      `${input.siteUrl}/contact`,
    ].join("\n"),
  };
}

/** To the partner: their account was suspended, or the suspension was lifted. */
export function partnerStatusMessage(input: {
  status: "active" | "suspended";
  businessName: string;
  reason: string | null;
  siteUrl: string;
}): { subject: string; body: string } {
  if (input.status === "suspended") {
    return {
      subject: `MalFleks: ${input.businessName}'s account is suspended`,
      body: [
        `The partner account for ${input.businessName} has been suspended.`,
        ...(input.reason ? ["", `The reason: ${input.reason}`] : []),
        "",
        "You can still sign in and see your listings and orders, but you can't",
        "submit products or confirm orders until it is lifted.",
        "",
        "If you think this is a mistake, tell us:",
        `${input.siteUrl}/contact`,
      ].join("\n"),
    };
  }
  return {
    subject: `MalFleks: ${input.businessName}'s account is active again`,
    body: [
      `The suspension on ${input.businessName} has been lifted. You can submit products`,
      "and confirm orders again.",
      "",
      "Open your partner page:",
      `${input.siteUrl}/partner`,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// To a customer, after the order is under way
// ---------------------------------------------------------------------------

/**
 * To the customer: the order will not be fulfilled.
 *
 * `paid` decides the one sentence a customer reads this email for. It is
 * whether a captured payment exists on the order, read from the database at
 * send time -- never a guess from the order's status, because an order can be
 * confirmed, emailed a pay link and cancelled without a shilling moving.
 */
export function orderCancelledMessage(input: {
  firstName: string | null;
  reference: string;
  productName: string;
  reason: string | null;
  paid: boolean;
  siteUrl: string;
}): { subject: string; body: string } {
  return {
    subject: `Your MalFleks order ${input.reference} has been cancelled`,
    body: [
      input.firstName ? `Hello ${input.firstName},` : "Hello,",
      "",
      `Your order for ${input.productName} (reference ${input.reference}) has been cancelled.`,
      ...(input.reason ? ["", `The reason: ${input.reason}`] : []),
      "",
      input.paid
        ? "Your payment will be refunded. We will email you again when the refund has been sent."
        : "You have not been charged.",
      "",
      "Your orders:",
      `${input.siteUrl}/account`,
    ].join("\n"),
  };
}

/** To the customer: it arrived. */
export function orderDeliveredMessage(input: {
  firstName: string | null;
  reference: string;
  productName: string;
  siteUrl: string;
}): { subject: string; body: string } {
  return {
    subject: `Your MalFleks order ${input.reference} has been delivered`,
    body: [
      input.firstName ? `Hello ${input.firstName},` : "Hello,",
      "",
      `Your order for ${input.productName} (reference ${input.reference}) has been marked`,
      "delivered. Thank you for buying through MalFleks.",
      "",
      "If it has not reached you, or something is wrong with it, tell us:",
      `${input.siteUrl}/contact`,
      "",
      "The delivery record stays here:",
      `${input.siteUrl}/track/${encodeURIComponent(input.reference)}`,
    ].join("\n"),
  };
}

/** To the customer: money has gone back to them. */
export function refundRecordedMessage(input: {
  firstName: string | null;
  reference: string;
  amountTZS: number;
  refundReference: string;
  siteUrl: string;
}): { subject: string; body: string } {
  return {
    subject: `Refund sent for your MalFleks order ${input.reference}`,
    body: [
      input.firstName ? `Hello ${input.firstName},` : "Hello,",
      "",
      `We have refunded ${money(input.amountTZS)} for your cancelled order ${input.reference}.`,
      `Refund reference: ${input.refundReference}`,
      "",
      "It goes back to the mobile money number you paid from. If it has not",
      "arrived by tomorrow, tell us and quote the refund reference:",
      `${input.siteUrl}/contact`,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// To MalFleks's own inbox: what is stuck
// ---------------------------------------------------------------------------

export interface StuckOrderLine {
  reference: string;
  productName: string;
  branchName: string;
  /** Whole hours since the moment it started waiting. */
  hours: number;
}

function waited(hours: number): string {
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)} days`;
}

/**
 * One daily email listing the orders nobody has moved. Nothing here is acted
 * on automatically -- whether a stale order should be cancelled is a decision
 * the owner has not made, so this only makes sure somebody sees them.
 */
export function stuckOrdersDigestMessage(input: {
  /** Pending more than a day: the branch has not answered. */
  undecided: StuckOrderLine[];
  /** Confirmed more than two days ago and still unpaid. */
  unpaid: StuckOrderLine[];
  /** Paid more than three days ago and not marked delivered. */
  undelivered: StuckOrderLine[];
  adminUrl: string;
}): { subject: string; body: string } {
  const total = input.undecided.length + input.unpaid.length + input.undelivered.length;
  const section = (title: string, lines: StuckOrderLine[]): string[] =>
    lines.length === 0
      ? []
      : [
          "",
          `${title} (${lines.length})`,
          ...lines.map((l) => `  ${l.reference} — ${l.productName}, ${l.branchName} — ${waited(l.hours)}`),
        ];
  return {
    subject: `MalFleks: ${total} ${total === 1 ? "order needs" : "orders need"} a nudge`,
    body: [
      "These orders have stopped moving. Nothing has been cancelled or changed.",
      ...section("Waiting more than a day for the branch to confirm", input.undecided),
      ...section("Confirmed more than two days ago and not paid", input.unpaid),
      ...section("Paid more than three days ago and not marked delivered", input.undelivered),
      "",
      `Open them: ${input.adminUrl}/admin/orders`,
    ].join("\n"),
  };
}

/** To MalFleks's own inbox: a paid order was cancelled, so a refund is owed. */
export function refundDueAdminMessage(input: {
  reference: string;
  productName: string;
  reason: string | null;
  adminUrl: string;
}): { subject: string; body: string } {
  return {
    subject: `MalFleks: refund due on ${input.reference}`,
    body: [
      `Order ${input.reference} (${input.productName}) was cancelled after the customer had paid.`,
      ...(input.reason ? [`Reason given: ${input.reason}`] : []),
      "",
      "The customer has been told they will be refunded. Send the refund from",
      "ClickPesa, then record it so the books and the customer's email match:",
      `${input.adminUrl}/admin/payouts`,
    ].join("\n"),
  };
}
