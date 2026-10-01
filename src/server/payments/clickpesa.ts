import { createHmac } from "node:crypto";

/**
 * ClickPesa hosted-checkout integration -- Phase 2 of
 * malfleks-payment-integration.md, now carrying the full escrow amount per
 * malfleks-escrow-ledger-design.md (the amount charged is
 * quote.orderTotalTZS, never depositTZS).
 *
 * Three moving pieces, in the order a real checkout actually uses them:
 *
 *  1. `getAuthToken` -- exchanges CLICKPESA_CLIENT_ID/CLICKPESA_API_KEY for a
 *     short-lived (1h, per ClickPesa's own docs) bearer token, cached in
 *     memory between calls on the same server instance.
 *  2. `createChecksum`/`verifyChecksum` -- ClickPesa's HMAC-SHA256-over-
 *     canonicalized-JSON scheme (docs.clickpesa.com/home/checksum): sort
 *     every object's keys recursively, JSON.stringify with no whitespace,
 *     HMAC-SHA256 with the checksum secret, hex digest. Used both to sign
 *     the outgoing checkout-link request and to verify the incoming webhook
 *     in `src/app/api/payments/clickpesa/route.ts`. Matches ClickPesa's own
 *     reference implementation byte for byte (github.com/ClickPesa/
 *     clickpesa-api-checksum-demo/blob/main/javascript/checksum.js).
 *  3. `generateCheckoutLink` -- the POST that returns the hosted checkout URL
 *     to redirect the customer to.
 *
 * All three ClickPesa credentials (CLICKPESA_CLIENT_ID, CLICKPESA_API_KEY,
 * CLICKPESA_CHECKSUM_SECRET) live in Vercel env vars on the `malfleks`
 * project (Production scope), set 19 Sep 2026 -- see
 * malfleks-clickpesa-account-audit.md. The account is pre-KYC as of that
 * date: capped at 100,000 TZS total (not per-transaction -- total, ever,
 * until KYC clears) and 100 API calls/day. Every call here counts against
 * that cap.
 */

const CLICKPESA_API_BASE = "https://api.clickpesa.com/third-parties";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set -- see malfleks-clickpesa-account-audit.md for where it comes from.`,
    );
  }
  return value;
}

/**
 * ClickPesa requires `customerPhone` "starting with country code and without
 * the plus sign, e.g., 255712345678" -- its generate-checkout-link API
 * reference. MalFleks stores the phone as the customer typed it: the order
 * form hints a Tanzanian format but never rewrites it, so `+255...`, spaced
 * digits and a leading local `0` all reach here. Any of them gets the whole
 * request rejected, so normalise at the boundary rather than asking every
 * caller to remember a rule that belongs to ClickPesa.
 */
export function normalizeCustomerPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("255")) return digits;
  if (digits.startsWith("0")) return `255${digits.slice(1)}`;
  return digits;
}

// ---- Checksum (docs.clickpesa.com/home/checksum) --------------------------

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = canonicalize((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

/**
 * `payload` must NOT already contain `checksum`/`checksumMethod` -- those
 * are this function's output, never part of what gets signed. Callers that
 * received a payload carrying them (a webhook body) strip them first; see
 * `checkChecksum`.
 */
export function createChecksum(payload: Record<string, unknown>): string {
  return hmacOver(requireEnv("CLICKPESA_CHECKSUM_SECRET"), payload);
}

function hmacOver(secret: string, payload: Record<string, unknown>): string {
  return createHmac("sha256", secret)
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

/**
 * Why a verdict and not a boolean.
 *
 * `verifyChecksum` used to answer `false` to three different situations: a
 * request carrying no signature at all, a signature that did not match, and
 * a server with no `CLICKPESA_CHECKSUM_SECRET` configured. The webhook
 * handler turned all three into the same 400 and the same one-line log, so a
 * misconfiguration on this side was indistinguishable from a forgery on
 * someone else's -- and only one of those is expensive: ClickPesa collects
 * the money, the callback is refused, `OrderPayment` stays `pending`, and no
 * `LedgerEntry` is ever written.
 *
 * That is exactly the shape of the two rejected deliveries recorded on
 * 20 Sep 2026, and nothing in the log says which of the three they were.
 * Hence a verdict that names the cause, which the handler then logs.
 */
export type ChecksumVerdict =
  | { ok: true; signedOver: "body" | "data" }
  | { ok: false; reason: "no-checksum" | "secret-not-configured" | "mismatch" };

/**
 * Verifies a payload against a `checksum` field carried inside that same
 * payload. Strips `checksum`/`checksumMethod` before recomputing, exactly as
 * ClickPesa's own verification does.
 *
 * ## Why two candidate scopes
 *
 * ClickPesa's docs say only that "webhooks payload are also signed using the
 * same method as defined below" -- and never say what "the payload" is on
 * the way in. Outbound, this module signs the whole request body, which is
 * flat. Inbound, a webhook body is `{event, data: {...}, checksum}`, and
 * both "the whole body minus checksum" and "the data object" are honest
 * readings of that one sentence.
 *
 * So both are tried, against the same secret. That is not a weaker check: it
 * is the same HMAC computed over the two scopes the documentation leaves
 * open, and an attacker without the secret can forge neither. What it buys
 * is that a guess about an undocumented detail cannot silently cost a
 * payment.
 */
export function checkChecksum(payload: Record<string, unknown>): ChecksumVerdict {
  const checksum = payload.checksum;
  if (typeof checksum !== "string" || checksum.length === 0) {
    return { ok: false, reason: "no-checksum" };
  }
  // Everything except the signature and its method name is what was signed.
  const rest = { ...payload };
  delete rest.checksum;
  delete rest.checksumMethod;

  let secret: string;
  try {
    secret = requireEnv("CLICKPESA_CHECKSUM_SECRET");
  } catch {
    return { ok: false, reason: "secret-not-configured" };
  }

  if (hmacOver(secret, rest) === checksum) return { ok: true, signedOver: "body" };

  const data = rest.data;
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    if (hmacOver(secret, data as Record<string, unknown>) === checksum) {
      return { ok: true, signedOver: "data" };
    }
  }

  return { ok: false, reason: "mismatch" };
}

/**
 * The yes/no form. Kept for callers that have no use for the cause -- the
 * webhook handler is not one of them and uses `checkChecksum` directly.
 */
export function verifyChecksum(payload: Record<string, unknown>): boolean {
  return checkChecksum(payload).ok;
}

// ---- Auth token -------------------------------------------------------
// docs.clickpesa.com/api-reference/authorization/generate-token

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Drops the cached token. Exists for tests: the cache is module-level and
 * survives between `it` blocks, so without this the first test to fetch a
 * token silently satisfies every later one -- which is exactly what happened
 * here. Three tests in clickpesa.test.ts asserted call counts and failure
 * reasons that only held with a cold cache, and had been red since they were
 * written on 19 Sep 2026 because nobody ran the suite.
 */
export function resetAuthTokenCache(): void {
  cachedToken = null;
}

/**
 * A fresh bearer token, reusing a cached one until 5 minutes before its
 * documented 1-hour expiry. Module-level cache: fine for a single
 * serverless instance's lifetime -- a cold start just fetches a new one,
 * this is not meant to survive across instances or deploys.
 */
async function getAuthToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const response = await fetch(`${CLICKPESA_API_BASE}/generate-token`, {
    method: "POST",
    headers: {
      "client-id": requireEnv("CLICKPESA_CLIENT_ID"),
      "api-key": requireEnv("CLICKPESA_API_KEY"),
    },
  });

  if (!response.ok) {
    throw new Error(`ClickPesa generate-token failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as { success?: boolean; token?: string };
  if (!data.token) {
    throw new Error("ClickPesa generate-token responded without a token");
  }

  // ClickPesa returns the token ALREADY PREFIXED -- the live response is
  // `{"success":true,"token":"Bearer eyJhbGci..."}`, verified against the real
  // API on 23 Sep 2026. `generateCheckoutLink` then sends
  // `Authorization: Bearer ${token}`, which without this strip would produce
  // `Bearer Bearer eyJ...` and be rejected. Storing the bare token keeps the
  // prefix in exactly one place: the header that needs it.
  const bare = data.token.trim().replace(/^Bearer\s+/i, "");
  cachedToken = { token: bare, expiresAt: Date.now() + 55 * 60_000 };
  return bare;
}

// ---- Checkout link ------------------------------------------------------
// docs.clickpesa.com/api-reference/collection/generate-checkout-link

export interface CheckoutLinkInput {
  /** `Order.reference` -- read aloud to a branch on the phone, now also the id ClickPesa echoes back as `orderReference`. */
  orderReference: string;
  /** The full amount to collect. Always `quote.orderTotalTZS`, never `depositTZS` -- see malfleks-escrow-ledger-design.md. */
  totalPriceTZS: number;
  customerName: string;
  customerPhone: string;
  callbackUrl: string;
}

export type CheckoutLinkOutcome =
  | { ok: true; checkoutLink: string }
  | {
      ok: false;
      reason: "auth-failed" | "request-failed" | "duplicate-reference";
      /** What ClickPesa actually said, for the caller to log. Never shown to a customer. */
      detail?: string;
    };

export async function generateCheckoutLink(
  input: CheckoutLinkInput,
): Promise<CheckoutLinkOutcome> {
  let token: string;
  try {
    token = await getAuthToken();
  } catch (error) {
    return {
      ok: false,
      reason: "auth-failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const body: Record<string, unknown> = {
    totalPrice: String(input.totalPriceTZS),
    orderReference: input.orderReference,
    orderCurrency: "TZS",
    customerName: input.customerName,
    customerPhone: normalizeCustomerPhone(input.customerPhone),
    callbackUrl: input.callbackUrl,
  };
  // Signed even though ClickPesa's schema lists `checksum` as optional here --
  // Checksum Security is ON for this application (turned on 19 Sep 2026), and
  // signing every outbound request is the same "don't assume, verify" posture
  // this module holds inbound webhooks to.
  body.checksum = createChecksum(body);

  let response: Response;
  try {
    response = await fetch(`${CLICKPESA_API_BASE}/checkout-link/generate-checkout-url`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: "request-failed" };
  }

  if (response.status === 409) return { ok: false, reason: "duplicate-reference" };
  if (!response.ok) {
    // Hand the status and body back rather than discarding them. Every
    // rejection used to reach the admin as the same "try again in a moment",
    // which is actively misleading when the cause is a malformed request that
    // will fail identically every time -- a non-alphanumeric `orderReference`
    // cost a full session to find for exactly that reason. The caller logs it;
    // this module stays free of the database so its tests can mock fetch and
    // touch no Postgres.
    const body = await response.text().catch(() => "<unreadable body>");
    return {
      ok: false,
      reason: "request-failed",
      detail: `generate-checkout-url returned ${response.status}: ${body.slice(0, 500)}`,
    };
  }

  const data = (await response.json().catch(() => null)) as { checkoutLink?: string } | null;
  if (!data?.checkoutLink) return { ok: false, reason: "request-failed" };

  return { ok: true, checkoutLink: data.checkoutLink };
}

// ---- Payment status ----------------------------------------------------
// docs.clickpesa.com/api-reference/collection/querying-for-payments/querying-for-payments

/**
 * One payment attempt as ClickPesa reports it. Every field is nullable
 * because this is a third party's JSON: a missing field must degrade to
 * "unknown", never to a thrown TypeError inside a money path.
 */
export interface ClickPesaPaymentRecord {
  /** Upper-cased. Documented values: SUCCESS, SETTLED, PROCESSING, PENDING, FAILED. */
  status: string;
  paymentReference: string | null;
  orderReference: string | null;
  collectedAmount: number | null;
  message: string | null;
  updatedAt: string | null;
}

export type PaymentStatusOutcome =
  | { ok: true; found: true; records: ClickPesaPaymentRecord[] }
  /** 404 -- ClickPesa has no attempt on this reference yet: link sent, not paid. */
  | { ok: true; found: false }
  | { ok: false; reason: "auth-failed" | "request-failed"; detail?: string };

/**
 * Ask ClickPesa what happened to a payment, instead of waiting to be told.
 *
 * ## Why this exists
 *
 * Until now the only way a payment could be recorded was the webhook, and the
 * webhook is only as good as `CLICKPESA_CHECKSUM_SECRET`. On 20 Sep 2026 two
 * deliveries were refused on checksum, and the secret on the project the
 * webhook actually reaches has never been verified against anything. One
 * unverifiable secret stood between a customer's money and the ledger.
 *
 * This call needs no checksum. It authenticates *outbound* with our own API
 * key -- the same credential that already generates checkout links -- so a
 * payment can be confirmed even when every webhook is refused. It is a second,
 * independent road to the same capture, not a weaker one: the answer comes
 * from ClickPesa over TLS on a request we initiated, which is a stronger
 * provenance than an inbound POST anyone could send.
 *
 * Returns an array because ClickPesa does: one order reference can carry more
 * than one attempt (a customer who fails once and retries on the same link).
 */
/** How long one status check may take before it counts as failed. */
const STATUS_TIMEOUT_MS = 8_000;

export async function queryPaymentStatus(
  orderReference: string,
): Promise<PaymentStatusOutcome> {
  let token: string;
  try {
    token = await getAuthToken();
  } catch (error) {
    return {
      ok: false,
      reason: "auth-failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  let response: Response;
  try {
    response = await fetch(
      `${CLICKPESA_API_BASE}/payments/${encodeURIComponent(orderReference)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        // The Money page asks while it renders. A ClickPesa that hangs must
        // cost the admin a few seconds, not the whole page.
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      },
    );
  } catch (error) {
    return {
      ok: false,
      reason: "request-failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  if (response.status === 404) return { ok: true, found: false };
  if (!response.ok) {
    const body = await response.text().catch(() => "<unreadable body>");
    return {
      ok: false,
      reason: response.status === 401 ? "auth-failed" : "request-failed",
      detail: `payments/${orderReference} returned ${response.status}: ${body.slice(0, 300)}`,
    };
  }

  const data: unknown = await response.json().catch(() => null);
  // Documented as an array; tolerate a single object rather than misreading it
  // as "no attempts", which would leave a paid order looking unpaid.
  const raw = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];

  return { ok: true, found: true, records: raw.map(toPaymentRecord) };
}

function toPaymentRecord(value: unknown): ClickPesaPaymentRecord {
  const r = (value ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const amount = Number(r.collectedAmount);
  return {
    status: typeof r.status === "string" ? r.status.trim().toUpperCase() : "UNKNOWN",
    paymentReference: str(r.paymentReference),
    orderReference: str(r.orderReference),
    collectedAmount: Number.isFinite(amount) ? amount : null,
    message: str(r.message),
    updatedAt: str(r.updatedAt),
  };
}
