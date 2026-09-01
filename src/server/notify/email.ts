import { SOKO_CONTACT_EMAIL } from "@/lib/contact";

/**
 * Telling a human that something happened.
 *
 * Until this existed, nothing anywhere in Soko told anyone about anything. A
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
 * ## Configuring it
 *
 * `RESEND_API_KEY` from resend.com. Optionally `SOKO_NOTIFY_EMAIL` to send
 * somewhere other than the published contact address, and `RESEND_FROM` once a
 * domain is verified. Without a verified domain Resend accepts
 * `onboarding@resend.dev` as the sender but will only deliver to the address
 * that owns the Resend account — which is exactly the case here, since these
 * go to Soko's own inbox.
 */

/** Where notifications go. Overridable, but never empty. */
export function notifyAddress(env: Record<string, string | undefined> = process.env): string {
  // `?.trim() ||` rather than `??`: an env var set to "" is the empty-string
  // trap that cost this project three deployments. `??` does not catch it.
  return env.SOKO_NOTIFY_EMAIL?.trim() || SOKO_CONTACT_EMAIL;
}

/** Who they come from. `onboarding@resend.dev` works before a domain exists. */
export function notifySender(env: Record<string, string | undefined> = process.env): string {
  return env.RESEND_FROM?.trim() || "Soko <onboarding@resend.dev>";
}

export function isEmailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return (env.RESEND_API_KEY?.trim() ?? "") !== "";
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
  if (!isEmailConfigured(env)) return { sent: false, reason: "not-configured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY?.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: notifySender(env),
        to: [notifyAddress(env)],
        subject,
        text: body,
      }),
    });

    // A rejected key or an unverified sender comes back as a 4xx with a JSON
    // body. Distinguished from a network failure because they need different
    // fixes — one is a setting, the other is a retry.
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
    subject: `Soko: ${input.businessName} applied (${what})`,
    body: [
      `${input.businessName} in ${input.city} has applied to join Soko as a ${what}.`,
      "",
      "Nothing is listed until you approve it, and approving does not put them",
      "on the map either — that is still a separate step after you have",
      "confirmed their address.",
      "",
      `Review it: ${input.siteUrl}/admin`,
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
    subject: `Soko: new order request ${input.reference}`,
    body: [
      input.productName
        ? `${input.productName} — reference ${input.reference}`
        : `Reference ${input.reference}`,
      "",
      "A customer is waiting to hear from the branch. Soko takes no payment,",
      "so this is a message to be passed on, not a sale to be processed.",
      "",
      `Open it: ${input.siteUrl}/admin/orders`,
      "",
      "The customer's name, phone number and address are on that page rather",
      "than in this email.",
    ].join("\n"),
  };
}
