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
 * `verifyChecksum`.
 */
export function createChecksum(payload: Record<string, unknown>): string {
  const secret = requireEnv("CLICKPESA_CHECKSUM_SECRET");
  const canonical = canonicalize(payload);
  return createHmac("sha256", secret).update(JSON.stringify(canonical)).digest("hex");
}

/**
 * Verifies a payload against a `checksum` field carried inside that same
 * payload -- the shape both the checkout-link request body and (per
 * ClickPesa's docs: "webhooks payload are also signed using the same
 * method") an incoming webhook body use. Strips `checksum`/`checksumMethod`
 * before recomputing, exactly as ClickPesa's own verification does.
 *
 * Returns `false` -- never throws -- for a payload with no `checksum` field
 * at all, which is the correct verdict for an unsigned request hitting a
 * public webhook URL, not an error to propagate.
 */
export function verifyChecksum(payload: Record<string, unknown>): boolean {
  const { checksum, checksumMethod: _checksumMethod, ...rest } = payload;
  if (typeof checksum !== "string" || checksum.length === 0) return false;
  try {
    return createChecksum(rest) === checksum;
  } catch {
    return false;
  }
}

// ---- Auth token -------------------------------------------------------
// docs.clickpesa.com/api-reference/authorization/generate-token

let cachedToken: { token: string; expiresAt: number } | null = null;

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

  cachedToken = { token: data.token, expiresAt: Date.now() + 55 * 60_000 };
  return data.token;
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
  | { ok: false; reason: "auth-failed" | "request-failed" | "duplicate-reference" };

export async function generateCheckoutLink(
  input: CheckoutLinkInput,
): Promise<CheckoutLinkOutcome> {
  let token: string;
  try {
    token = await getAuthToken();
  } catch {
    return { ok: false, reason: "auth-failed" };
  }

  const body: Record<string, unknown> = {
    totalPrice: String(input.totalPriceTZS),
    orderReference: input.orderReference,
    orderCurrency: "TZS",
    customerName: input.customerName,
    customerPhone: input.customerPhone,
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
  if (!response.ok) return { ok: false, reason: "request-failed" };

  const data = (await response.json().catch(() => null)) as { checkoutLink?: string } | null;
  if (!data?.checkoutLink) return { ok: false, reason: "request-failed" };

  return { ok: true, checkoutLink: data.checkoutLink };
}
