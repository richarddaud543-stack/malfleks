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
 * flat. Inbound, the body is `{event, data: {...}}` with the checksum inside
 * `data` (observed 2 Oct 2026), so "the data object" is the likeliest scope
 * and "the whole body" the other honest reading of that one sentence.
 *
 * So both are tried, against the same secret. That is not a weaker check: it
 * is the same HMAC computed over the two scopes the documentation leaves
 * open, and an attacker without the secret can forge neither. What it buys
 * is that a guess about an undocumented detail cannot silently cost a
 * payment.
 */
export function checkChecksum(payload: Record<string, unknown>): ChecksumVerdict {
  const data = isPlainObject(payload.data) ? payload.data : null;

  // Where ClickPesa actually puts it. The first real PAYMENT RECEIVED, on
  // 2 Oct 2026, arrived as `{event, data: {..., checksum, checksumMethod}}` --
  // the signature *inside* `data`, not beside it. This function used to look
  // only at the top level, answered "no-checksum", and the webhook refused a
  // genuine, signed notification of money collected. Both places are read now.
  const checksum = nonEmptyString(payload.checksum) ?? nonEmptyString(data?.checksum);
  if (!checksum) return { ok: false, reason: "no-checksum" };

  let secret: string;
  try {
    secret = requireEnv("CLICKPESA_CHECKSUM_SECRET");
  } catch {
    return { ok: false, reason: "secret-not-configured" };
  }

  // Everything except the signature and its method name is what was signed,
  // at whichever level they were found.
  const signedData = data ? withoutChecksumFields(data) : null;
  const signedBody = withoutChecksumFields(payload);
  if (signedData) signedBody.data = signedData;

  if (signedData && hmacOver(secret, signedData) === checksum) return { ok: true, signedOver: "data" };
  if (hmacOver(secret, signedBody) === checksum) return { ok: true, signedOver: "body" };

  return { ok: false, reason: "mismatch" };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function withoutChecksumFields(value: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...value };
  delete rest.checksum;
  delete rest.checksumMethod;
  return rest;
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
    // ClickPesa answers a reference nobody has tried to pay yet with a 400,
    // not a 404: `{"message":"Invalid or missing payment:  ORADOD9Y7G"}`
    // (seen live 1-2 Oct 2026). That is "no attempts", not a failed check --
    // treating it as a failure logged an error on every run for every link a
    // customer simply had not opened yet.
    if (response.status === 400 && /invalid or missing payment/i.test(body)) {
      return { ok: true, found: false };
    }
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

// ---- Payouts ------------------------------------------------------------
// docs.clickpesa.com/payout-api/payout-api-overview
//
// Money going *out*: MalFleks paying a branch or courier their share. Until
// 5 Oct 2026 every payout was sent by hand from the ClickPesa dashboard; these
// four calls are what lets `src/server/money/auto-payouts.ts` send one itself.
//
// The order ClickPesa documents, and the order they are used in:
//   1. `getAccountBalance`        -- is there money to send?
//   2. `previewMobilePayout`      -- would this exact payout be accepted, and
//                                    what will it cost? Sends nothing.
//   3. `createMobilePayout`       -- sends it. Limited by ClickPesa to ONE per
//                                    merchant every 60 seconds.
//   4. `queryPayoutStatus`        -- what became of it?
//
// The outcome types below are deliberately three-way where it matters:
// "accepted", "refused" (definitely nothing sent) and "unknown" (the request
// may or may not have arrived). Only the first two are safe to act on. An
// unknown must never be retried with a new reference -- that is how a partner
// gets paid twice.

const PAYOUT_TIMEOUT_MS = 12_000;

export interface PayoutRequest {
  /** Whole shillings to arrive in the partner's wallet. */
  amountTZS: number;
  /** Twelve digits starting 255, no plus -- see `toPayoutPhone`. */
  phoneNumber: string;
  /** Alphanumeric only, unique for ever. ClickPesa refuses a repeat with 409. */
  orderReference: string;
}

function payoutBody(input: PayoutRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    amount: input.amountTZS,
    phoneNumber: input.phoneNumber,
    currency: "TZS",
    orderReference: input.orderReference,
  };
  body.checksum = createChecksum(body);
  return body;
}

async function tokenOrNull(): Promise<{ token: string } | { error: string }> {
  try {
    return { token: await getAuthToken() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export type BalanceOutcome =
  | { ok: true; balanceTZS: number }
  | { ok: false; reason: "auth-failed" | "request-failed" | "no-account"; detail?: string };

/** What ClickPesa actually holds for this merchant, in shillings. */
export async function getAccountBalance(): Promise<BalanceOutcome> {
  const auth = await tokenOrNull();
  if ("error" in auth) return { ok: false, reason: "auth-failed", detail: auth.error };

  let response: Response;
  try {
    response = await fetch(`${CLICKPESA_API_BASE}/account/balance`, {
      method: "GET",
      headers: { Authorization: `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, reason: "request-failed", detail: error instanceof Error ? error.message : String(error) };
  }
  if (response.status === 404) return { ok: false, reason: "no-account" };
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false, reason: response.status === 401 ? "auth-failed" : "request-failed", detail: `balance returned ${response.status}: ${text.slice(0, 300)}` };
  }
  const data: unknown = await response.json().catch(() => null);
  const rows = Array.isArray(data) ? data : [];
  const tzs = rows.find((r) => (r as { currency?: unknown })?.currency === "TZS") as { balance?: unknown } | undefined;
  const balance = Number(tzs?.balance);
  if (!Number.isFinite(balance)) return { ok: false, reason: "request-failed", detail: "balance response had no TZS row" };
  return { ok: true, balanceTZS: balance };
}

export type PayoutPreviewOutcome =
  | { ok: true; feeTZS: number; totalTZS: number; balanceTZS: number | null; receiverName: string | null; provider: string | null }
  /** ClickPesa said no. Nothing was sent, and nothing would have been. */
  | { ok: false; reason: "refused"; status: number; detail: string }
  | { ok: false; reason: "auth-failed" | "request-failed"; detail?: string };

/** Ask ClickPesa whether this payout would go, and what it would cost. Sends nothing; not rate-limited. */
export async function previewMobilePayout(input: PayoutRequest): Promise<PayoutPreviewOutcome> {
  const auth = await tokenOrNull();
  if ("error" in auth) return { ok: false, reason: "auth-failed", detail: auth.error };

  let response: Response;
  try {
    response = await fetch(`${CLICKPESA_API_BASE}/payouts/preview-mobile-money-payout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payoutBody(input)),
      signal: AbortSignal.timeout(PAYOUT_TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, reason: "request-failed", detail: error instanceof Error ? error.message : String(error) };
  }
  if (response.status === 401) return { ok: false, reason: "auth-failed", detail: "preview returned 401" };
  if (response.status >= 400 && response.status < 500) {
    const text = await response.text().catch(() => "");
    return { ok: false, reason: "refused", status: response.status, detail: text.slice(0, 300) };
  }
  if (!response.ok) return { ok: false, reason: "request-failed", detail: `preview returned ${response.status}` };

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const fee = Number(data?.fee);
  const total = Number(data?.amount);
  const balance = Number(data?.balance);
  const receiver = (data?.receiver ?? {}) as Record<string, unknown>;
  if (!data || !Number.isFinite(fee) || !Number.isFinite(total)) {
    return { ok: false, reason: "request-failed", detail: "preview response had no fee or amount" };
  }
  return {
    ok: true,
    feeTZS: fee,
    totalTZS: total,
    balanceTZS: Number.isFinite(balance) ? balance : null,
    receiverName: typeof receiver.accountName === "string" && receiver.accountName ? receiver.accountName : null,
    provider: typeof data.channelProvider === "string" ? data.channelProvider : null,
  };
}

/** A payout as ClickPesa reports it. Status is upper-cased; unknown shapes degrade to "UNKNOWN". */
export interface ClickPesaPayoutRecord {
  /** AUTHORIZED | SUCCESS | PROCESSING | PENDING | FAILED | REFUNDED | REVERSED */
  status: string;
  id: string | null;
  orderReference: string | null;
  feeTZS: number | null;
}

function toPayoutRecord(value: unknown): ClickPesaPayoutRecord {
  const r = (value ?? {}) as Record<string, unknown>;
  const fee = Number(r.fee);
  return {
    status: typeof r.status === "string" ? r.status.trim().toUpperCase() : "UNKNOWN",
    id: typeof r.id === "string" && r.id ? r.id : null,
    orderReference: typeof r.orderReference === "string" && r.orderReference ? r.orderReference : null,
    feeTZS: Number.isFinite(fee) ? fee : null,
  };
}

export type CreatePayoutOutcome =
  | { ok: true; record: ClickPesaPayoutRecord }
  /** A 4xx that is not a duplicate: ClickPesa refused it, so nothing was sent. */
  | { ok: false; reason: "refused"; status: number; detail: string }
  /** 409: this reference has been used -- an earlier request DID arrive. Look it up; never resend. */
  | { ok: false; reason: "duplicate-reference" }
  /** Could not even ask: no token. Nothing was sent. */
  | { ok: false; reason: "auth-failed"; detail?: string }
  /**
   * A timeout, a dropped connection or a 5xx. The request may have arrived and
   * the payout may be on its way. The caller must treat the money as possibly
   * sent until `queryPayoutStatus` says otherwise.
   */
  | { ok: false; reason: "unknown"; detail?: string };

/** Send a mobile-money payout. One per merchant every 60 seconds (ClickPesa's limit). */
export async function createMobilePayout(input: PayoutRequest): Promise<CreatePayoutOutcome> {
  const auth = await tokenOrNull();
  if ("error" in auth) return { ok: false, reason: "auth-failed", detail: auth.error };

  let response: Response;
  try {
    response = await fetch(`${CLICKPESA_API_BASE}/payouts/create-mobile-money-payout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payoutBody(input)),
      signal: AbortSignal.timeout(PAYOUT_TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, reason: "unknown", detail: error instanceof Error ? error.message : String(error) };
  }

  if (response.status === 409) return { ok: false, reason: "duplicate-reference" };
  if (response.status >= 400 && response.status < 500) {
    const text = await response.text().catch(() => "");
    return { ok: false, reason: "refused", status: response.status, detail: text.slice(0, 300) };
  }
  if (!response.ok) return { ok: false, reason: "unknown", detail: `create payout returned ${response.status}` };

  const data: unknown = await response.json().catch(() => null);
  // A 2xx we cannot read still means ClickPesa accepted the request.
  if (!data || typeof data !== "object") return { ok: false, reason: "unknown", detail: "create payout answered 2xx with an unreadable body" };
  return { ok: true, record: toPayoutRecord(data) };
}

export type PayoutStatusOutcome =
  | { ok: true; found: true; record: ClickPesaPayoutRecord }
  /** ClickPesa has no payout under this reference. */
  | { ok: true; found: false }
  | { ok: false; reason: "auth-failed" | "request-failed"; detail?: string };

/** Ask ClickPesa what became of a payout, by the reference it was sent under. */
export async function queryPayoutStatus(orderReference: string): Promise<PayoutStatusOutcome> {
  const auth = await tokenOrNull();
  if ("error" in auth) return { ok: false, reason: "auth-failed", detail: auth.error };

  let response: Response;
  try {
    response = await fetch(`${CLICKPESA_API_BASE}/payouts/${encodeURIComponent(orderReference)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, reason: "request-failed", detail: error instanceof Error ? error.message : String(error) };
  }
  if (response.status === 404) return { ok: true, found: false };
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 400 && /invalid or missing payout/i.test(text)) return { ok: true, found: false };
    return { ok: false, reason: response.status === 401 ? "auth-failed" : "request-failed", detail: `payouts/${orderReference} returned ${response.status}: ${text.slice(0, 300)}` };
  }
  const data: unknown = await response.json().catch(() => null);
  const first = Array.isArray(data) ? data[0] : data;
  if (!first || typeof first !== "object") return { ok: true, found: false };
  return { ok: true, found: true, record: toPayoutRecord(first) };
}
