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
  const provider = notifyProvider(env);
  if (!provider) return { sent: false, reason: "not-configured" };

  const to = notifyAddress(env);
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
  siteUrl: string;
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
      `Review it: ${input.siteUrl}/admin/applications`,
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
  siteUrl: string;
}): { subject: string; body: string } {
  return {
    subject: `MalFleks: new order request ${input.reference}`,
    body: [
      input.productName
        ? `${input.productName} — reference ${input.reference}`
        : `Reference ${input.reference}`,
      "",
      "A customer is waiting to hear from the branch. MalFleks takes no payment,",
      "so this is a message to be passed on, not a sale to be processed.",
      "",
      `Open it: ${input.siteUrl}/admin/orders`,
      "",
      "The customer's name, phone number and address are on that page rather",
      "than in this email.",
    ].join("\n"),
  };
}
