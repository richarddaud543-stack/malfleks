// @vitest-environment node
//
// Pure-logic and mocked-fetch tests -- no database involved, unlike most of
// this directory's siblings. `createChecksum`/`verifyChecksum` are also
// cross-checked standalone against ClickPesa's own published reference
// implementation (github.com/ClickPesa/clickpesa-api-checksum-demo); this
// suite is the "does it behave correctly inside this codebase" half of that
// verification.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createChecksum,
  generateCheckoutLink,
  normalizeCustomerPhone,
  resetAuthTokenCache,
  verifyChecksum,
} from "./clickpesa";

const ENV_KEYS = ["CLICKPESA_CLIENT_ID", "CLICKPESA_API_KEY", "CLICKPESA_CHECKSUM_SECRET"] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.CLICKPESA_CLIENT_ID = "test-client-id";
  process.env.CLICKPESA_API_KEY = "test-api-key";
  process.env.CLICKPESA_CHECKSUM_SECRET = "test-checksum-secret";
  // The token cache is module-level and outlives an `it` block. Without this
  // the first test to fetch a token warms it for every test after, and the
  // call-count and failure-reason assertions below quietly stop meaning
  // anything.
  resetAuthTokenCache();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
});

describe("createChecksum / verifyChecksum", () => {
  it("is deterministic and independent of key order", () => {
    const a = createChecksum({ amount: 100, currency: "TZS", reference: "TX1" });
    const b = createChecksum({ reference: "TX1", currency: "TZS", amount: 100 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes if any field changes", () => {
    const a = createChecksum({ amount: 100, reference: "TX1" });
    const b = createChecksum({ amount: 101, reference: "TX1" });
    expect(a).not.toBe(b);
  });

  it("round-trips through verifyChecksum", () => {
    const payload: Record<string, unknown> = { amount: 500, reference: "TX2" };
    payload.checksum = createChecksum(payload);
    expect(verifyChecksum(payload)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const payload: Record<string, unknown> = { amount: 500, reference: "TX2" };
    payload.checksum = createChecksum(payload);
    expect(verifyChecksum({ ...payload, amount: 999 })).toBe(false);
  });

  it("rejects a payload with no checksum field", () => {
    expect(verifyChecksum({ amount: 500, reference: "TX2" })).toBe(false);
  });

  it("rejects an empty-string checksum", () => {
    expect(verifyChecksum({ amount: 500, checksum: "" })).toBe(false);
  });

  it("ignores checksumMethod when verifying, matching ClickPesa's exclusion rule", () => {
    const base = { amount: 500, reference: "TX2" };
    const payload: Record<string, unknown> = { ...base, checksumMethod: "HMAC-SHA256" };
    payload.checksum = createChecksum(base);
    expect(verifyChecksum(payload)).toBe(true);
  });
});

describe("generateCheckoutLink", () => {
  function mockFetchSequence(...responses: Array<Partial<Response> & { json?: () => unknown }>) {
    const fn = vi.fn();
    for (const r of responses) {
      fn.mockResolvedValueOnce({
        ok: r.ok ?? true,
        status: r.status ?? 200,
        json: r.json ?? (async () => ({})),
        // A real Response always has text(); the failure path reads it for the
        // diagnostic detail, so the mock has to model it too.
        text: r.text ?? (async () => ""),
      } as Response);
    }
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  const input = {
    orderReference: "ABCD1234",
    totalPriceTZS: 45000,
    customerName: "Asha Mwenda",
    customerPhone: "+255754123456",
    callbackUrl: "https://malfleks.vercel.app/api/payments/clickpesa",
  };

  it("fetches a token, signs the request, and returns the checkout link", async () => {
    const fetchMock = mockFetchSequence(
      { json: async () => ({ success: true, token: "jwt-token" }) },
      { json: async () => ({ checkoutLink: "https://checkout.clickpesa.com/xyz" }) },
    );

    const result = await generateCheckoutLink(input);

    expect(result).toEqual({ ok: true, checkoutLink: "https://checkout.clickpesa.com/xyz" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [tokenCall, checkoutCall] = fetchMock.mock.calls;
    expect(tokenCall[0]).toContain("/generate-token");
    expect((tokenCall[1] as RequestInit).headers).toMatchObject({
      "client-id": "test-client-id",
      "api-key": "test-api-key",
    });

    expect(checkoutCall[0]).toContain("/checkout-link/generate-checkout-url");
    const sentBody = JSON.parse((checkoutCall[1] as RequestInit).body as string);
    expect(sentBody.totalPrice).toBe("45000");
    expect(sentBody.orderReference).toBe("ABCD1234");
    expect(sentBody.orderCurrency).toBe("TZS");
    expect(typeof sentBody.checksum).toBe("string");
    expect((checkoutCall[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer jwt-token",
    });
  });

  it("reuses a cached token across calls", async () => {
    const fetchMock = mockFetchSequence(
      { json: async () => ({ success: true, token: "jwt-token" }) },
      { json: async () => ({ checkoutLink: "https://checkout.clickpesa.com/first" }) },
      { json: async () => ({ checkoutLink: "https://checkout.clickpesa.com/second" }) },
    );

    await generateCheckoutLink(input);
    await generateCheckoutLink({ ...input, orderReference: "EFGH5678" });

    // 3 calls total, not 4 -- the second checkout call reused the cached token.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns auth-failed when the token request fails", async () => {
    const fetchMock = mockFetchSequence({ ok: false, status: 401 });
    const result = await generateCheckoutLink(input);
    expect(result).toEqual({ ok: false, reason: "auth-failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns duplicate-reference on a 409", async () => {
    mockFetchSequence(
      { json: async () => ({ success: true, token: "jwt-token" }) },
      { ok: false, status: 409 },
    );
    const result = await generateCheckoutLink(input);
    expect(result).toEqual({ ok: false, reason: "duplicate-reference" });
  });

  it("returns request-failed on any other non-2xx", async () => {
    mockFetchSequence(
      { json: async () => ({ success: true, token: "jwt-token" }) },
      { ok: false, status: 500 },
    );
    const result = await generateCheckoutLink(input);
    expect(result).toEqual({ ok: false, reason: "request-failed" });
  });

  it("returns request-failed when the response has no checkoutLink", async () => {
    mockFetchSequence(
      { json: async () => ({ success: true, token: "jwt-token" }) },
      { json: async () => ({ clientId: "abc" }) },
    );
    const result = await generateCheckoutLink(input);
    expect(result).toEqual({ ok: false, reason: "request-failed" });
  });
});

// ---------------------------------------------------------------------------
// Regression: 23 Sep 2026. ClickPesa's generate-checkout-link reference
// requires `customerPhone` "starting with country code and without the plus
// sign, e.g., 255712345678". MalFleks stored `+255754123456`, which was sent
// verbatim and rejected. These lock the normalisation at the boundary.
// ---------------------------------------------------------------------------

describe("normalizeCustomerPhone", () => {
  it("strips a leading plus", () => {
    expect(normalizeCustomerPhone("+255754123456")).toBe("255754123456");
  });

  it("strips spaces the customer typed", () => {
    expect(normalizeCustomerPhone("+255 629 264 383")).toBe("255629264383");
  });

  it("expands a local leading zero to the country code", () => {
    expect(normalizeCustomerPhone("0754123456")).toBe("255754123456");
  });

  it("leaves an already-correct number alone", () => {
    expect(normalizeCustomerPhone("255754123456")).toBe("255754123456");
  });

  it("drops punctuation without mangling the digits", () => {
    expect(normalizeCustomerPhone("(+255) 754-123-456")).toBe("255754123456");
  });
});
