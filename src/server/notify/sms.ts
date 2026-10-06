/**
 * Text messages, for the one thing that has to reach a customer who is not
 * looking at a screen: their delivery code.
 *
 * ## Why SMS at all
 *
 * The code is shown on the customer's order page and in their receipt email.
 * Both need the customer to have data and to open something. The person at
 * the door needs the code *now*, and in Tanzania the message that reliably
 * arrives is a text. The owner asked for it on 5 Oct 2026.
 *
 * ## The provider
 *
 * Beem (beem.africa), a Tanzanian SMS gateway: one POST, Basic auth, priced
 * per message in shillings. Sending to Tanzanian networks needs a **sender
 * name registered with TCRA through the provider** -- the regulator has
 * required one since June 2025, and Beem's own default name `INFO` is
 * switched off. So three settings are needed, and until all three exist this
 * module sends nothing and says `not-configured`:
 *
 *   BEEM_API_KEY, BEEM_SECRET_KEY  -- from the Beem dashboard
 *   SMS_SENDER_ID                  -- the approved sender name (max 11 characters)
 *
 * That is a supported state, not a broken one, exactly like email: the code
 * still reaches the customer on their order page and by email.
 *
 * Never throws. A text that did not go is never a reason to fail the payment
 * that triggered it.
 */

const BEEM_SEND_URL = "https://apisms.beem.africa/v1/send";
const SEND_TIMEOUT_MS = 8_000;

type Env = Record<string, string | undefined>;

export type SmsResult =
  | { sent: true }
  | { sent: false; reason: "not-configured" | "no-number" | "rejected" | "failed"; detail?: string };

export function isSmsConfigured(env: Env = process.env): boolean {
  return Boolean(env.BEEM_API_KEY?.trim() && env.BEEM_SECRET_KEY?.trim() && env.SMS_SENDER_ID?.trim());
}

/**
 * A Tanzanian mobile number as an SMS gateway wants it: twelve digits starting
 * 255, no plus. `null` for anything that is not recognisably one, so a typo in
 * an order form becomes "no text sent", never a text to a stranger abroad.
 */
export function toSmsNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (/^255[67]\d{8}$/.test(digits)) return digits;
  if (/^0[67]\d{8}$/.test(digits)) return `255${digits.slice(1)}`;
  if (/^[67]\d{8}$/.test(digits)) return `255${digits}`;
  return null;
}

/**
 * The delivery-code text. Swahili first, then English, in one 160-character
 * message: a second part doubles the cost and can arrive out of order.
 * Plain ASCII on purpose -- one accented or curly character switches the whole
 * message to a 70-character encoding.
 */
export function deliveryCodeSms(input: { reference: string; code: string }): string {
  return (
    `MalFleks ${input.reference}: namba ya kupokea mzigo ni ${input.code}. ` +
    "Mtajie msafirishaji UKISHAPOKEA mzigo tu. " +
    "Delivery code - give it only once you have your goods."
  );
}

/** Send one text. Never throws. */
export async function sendSms(to: string | null | undefined, message: string, env: Env = process.env): Promise<SmsResult> {
  if (!isSmsConfigured(env)) return { sent: false, reason: "not-configured" };
  const number = toSmsNumber(to);
  if (!number) return { sent: false, reason: "no-number" };

  const auth = Buffer.from(`${env.BEEM_API_KEY!.trim()}:${env.BEEM_SECRET_KEY!.trim()}`).toString("base64");
  try {
    const response = await fetch(BEEM_SEND_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        source_addr: env.SMS_SENDER_ID!.trim(),
        message,
        encoding: 0,
        recipients: [{ recipient_id: 1, dest_addr: number }],
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      // The body says why (an unapproved sender name is code 111). Kept for the
      // error log; it carries no secret and no message text.
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      return { sent: false, reason: "rejected", detail: `HTTP ${response.status} ${detail}`.trim() };
    }
    const data = (await response.json().catch(() => null)) as { successful?: boolean; valid?: number; message?: string } | null;
    if (data && (data.successful === false || data.valid === 0)) {
      return { sent: false, reason: "rejected", detail: String(data.message ?? "not accepted").slice(0, 200) };
    }
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: "failed", detail: error instanceof Error ? error.message : String(error) };
  }
}
