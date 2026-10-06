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
  checkChecksum,
  createChecksum,
  createMobilePayout,
  generateCheckoutLink,
  getAccountBalance,
  normalizeCustomerPhone,
  previewMobilePayout,
  queryPaymentStatus,
  queryPayoutStatus,
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

describe("checkChecksum verdicts", () => {
  // A webhook body's real shape, per ClickPesa's callback docs.
  const webhook = () => ({
    event: "PAYMENT RECEIVED",
    data: {
      orderReference: "ORADODN6CD",
      paymentReference: "CP123456",
      collectedAmount: 5574,
      status: "SUCCESS",
    },
  });

  it("accepts a body signed over the whole payload", () => {
    const body: Record<string, unknown> = webhook();
    body.checksum = createChecksum(webhook());
    expect(checkChecksum(body)).toEqual({ ok: true, signedOver: "body" });
  });

  it("accepts a body signed over the data object alone", () => {
    // ClickPesa documents only that webhooks use "the same method"; it never
    // says over what. This is the other honest reading of that sentence, and
    // getting it wrong is what silently drops a real payment.
    const body: Record<string, unknown> = webhook();
    body.checksum = createChecksum(webhook().data);
    expect(checkChecksum(body)).toEqual({ ok: true, signedOver: "data" });
  });

  it("distinguishes an unconfigured secret from a forgery", () => {
    const body: Record<string, unknown> = webhook();
    body.checksum = createChecksum(webhook());
    delete process.env.CLICKPESA_CHECKSUM_SECRET;
    // The point of the whole verdict type: this must NOT read as "mismatch".
    // A server that cannot check a signature has a configuration problem, and
    // saying so is the difference between a five-minute fix and a lost order.
    expect(checkChecksum(body)).toEqual({ ok: false, reason: "secret-not-configured" });
  });

  it("reports a genuine mismatch as a mismatch", () => {
    const body: Record<string, unknown> = webhook();
    body.checksum = createChecksum(webhook());
    (body.data as Record<string, unknown>).collectedAmount = 1;
    expect(checkChecksum(body)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("reports a missing signature as such", () => {
    expect(checkChecksum(webhook())).toEqual({ ok: false, reason: "no-checksum" });
  });

  // The shape of the first real PAYMENT RECEIVED (2 Oct 2026), values
  // changed: the signature sits INSIDE `data`, with `checksumMethod` beside
  // it. Looking only at the top level refused it as "no-checksum".
  const realShape = () => ({
    id: "LCPCHL7TEST",
    status: "SUCCESS",
    paymentReference: "6274480000000000",
    paymentPhoneNumber: "255700000000",
    orderReference: "ORADODN6CD",
    collectedAmount: "5574.00",
    collectedCurrency: "TZS",
    message: "SUCCESS",
    channel: "HALOPESA",
    customer: { customerName: "Asha Mwenda", customerPhoneNumber: "255700000000" },
    clientId: "test-client-id",
  });

  it("accepts a signature carried inside data, as ClickPesa really sends it", () => {
    const body = {
      event: "PAYMENT RECEIVED",
      data: { ...realShape(), checksum: createChecksum(realShape()), checksumMethod: "canonical" },
    };
    expect(checkChecksum(body)).toEqual({ ok: true, signedOver: "data" });
  });

  it("still refuses a nested signature when the data was changed", () => {
    const body = {
      event: "PAYMENT RECEIVED",
      data: { ...realShape(), collectedAmount: "999999.00", checksum: createChecksum(realShape()), checksumMethod: "canonical" },
    };
    expect(checkChecksum(body)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("refuses the unsigned duplicate ClickPesa also posts", () => {
    // The same payment arrives a second time flat and with no checksum at all.
    expect(checkChecksum(realShape())).toEqual({ ok: false, reason: "no-checksum" });
  });

  it("does not accept a data-scoped signature for different data", () => {
    const body: Record<string, unknown> = webhook();
    body.checksum = createChecksum({ ...webhook().data, collectedAmount: 999999 });
    expect(checkChecksum(body)).toEqual({ ok: false, reason: "mismatch" });
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

  // Regression, 23 Sep 2026. The live API returns the token already prefixed:
  // {"success":true,"token":"Bearer eyJhbGci..."}. Every mock above returns a
  // BARE token, which is why `Bearer ${token}` looked correct for four days and
  // would have sent `Bearer Bearer eyJ...` the moment auth started working.
  it("does not double up the Bearer prefix ClickPesa already sends", async () => {
    const fetchMock = mockFetchSequence(
      { json: async () => ({ success: true, token: "Bearer jwt-token" }) },
      { json: async () => ({ checkoutLink: "https://checkout.clickpesa.com/xyz" }) },
    );

    const result = await generateCheckoutLink(input);

    expect(result).toEqual({ ok: true, checkoutLink: "https://checkout.clickpesa.com/xyz" });
    const [, checkoutCall] = fetchMock.mock.calls;
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
    expect(result).toMatchObject({ ok: false, reason: "auth-failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The detail is the whole point of the failure shape: a 401 here means
    // the client id or api key is wrong, which "try again in a moment" never
    // said.
    expect((result as { detail?: string }).detail).toContain("401");
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
    expect(result).toMatchObject({ ok: false, reason: "request-failed" });
    // Carries the status ClickPesa actually returned, so the caller can log
    // something a human can act on.
    expect((result as { detail?: string }).detail).toContain("500");
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

describe("queryPaymentStatus", () => {
  // Same shape as the token call the mock factory above produces for generateCheckoutLink.
  const tokenResponse = { ok: true, status: 200, json: async () => ({ success: true, token: "Bearer eyJtest" }), text: async () => "" };
  const respond = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  it("asks ClickPesa about the reference with the bare bearer token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(tokenResponse)
      .mockResolvedValueOnce(respond(200, []));
    vi.stubGlobal("fetch", fetchMock);

    await queryPaymentStatus("ORADODN6CD");

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://api.clickpesa.com/third-parties/payments/ORADODN6CD");
    expect(init).toMatchObject({ method: "GET", headers: { Authorization: "Bearer eyJtest" } });
  });

  it("reads 404 as 'no attempt yet', not as an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(respond(404, { message: "Not found" })));
    await expect(queryPaymentStatus("ORADODN6CD")).resolves.toEqual({ ok: true, found: false });
  });

  it("reads ClickPesa's 400 'Invalid or missing payment' as 'no attempt yet' too", async () => {
    // What it actually returns for a link nobody has opened (seen live 1 Oct 2026).
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(respond(400, { message: "Invalid or missing payment:  ORADOD9Y7G" })),
    );
    await expect(queryPaymentStatus("ORADOD9Y7G")).resolves.toEqual({ ok: true, found: false });
  });

  it("still reports any other 400 as a failed check", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(respond(400, { message: "Bad request" })));
    await expect(queryPaymentStatus("ORADODN6CD")).resolves.toMatchObject({ ok: false, reason: "request-failed" });
  });

  it("normalises each record and keeps unknown fields as null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(
        respond(200, [
          { status: "success", paymentReference: "CP1", collectedAmount: "5574", orderReference: "ORADODN6CD" },
          { status: "FAILED" },
        ]),
      ),
    );
    const result = await queryPaymentStatus("ORADODN6CD");
    expect(result).toEqual({
      ok: true,
      found: true,
      records: [
        { status: "SUCCESS", paymentReference: "CP1", orderReference: "ORADODN6CD", collectedAmount: 5574, message: null, updatedAt: null },
        { status: "FAILED", paymentReference: null, orderReference: null, collectedAmount: null, message: null, updatedAt: null },
      ],
    });
  });

  it("tolerates a single object where an array was documented", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(respond(200, { status: "SUCCESS", collectedAmount: 5574 })));
    const result = await queryPaymentStatus("ORADODN6CD");
    expect(result).toMatchObject({ ok: true, found: true, records: [{ status: "SUCCESS", collectedAmount: 5574 }] });
  });

  it("reports a 401 as auth-failed with the detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tokenResponse).mockResolvedValueOnce(respond(401, { message: "Invalid or Expired Token" })));
    const result = await queryPaymentStatus("ORADODN6CD");
    expect(result).toMatchObject({ ok: false, reason: "auth-failed" });
    expect((result as { detail?: string }).detail).toContain("401");
  });

  it("reports a token failure as auth-failed without calling the payments endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respond(400, {}));
    vi.stubGlobal("fetch", fetchMock);
    await expect(queryPaymentStatus("ORADODN6CD")).resolves.toMatchObject({ ok: false, reason: "auth-failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---- Payouts ------------------------------------------------------------

describe("payouts", () => {
  const TOKEN = () => new Response(JSON.stringify({ success: true, token: "Bearer tok" }), { status: 200 });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const REQUEST = { amountTZS: 94_000, phoneNumber: "255754000111", orderReference: "PABC123" };

  /** First call is always the token; the second is the call under test. */
  function stub(second: Response | Error) {
    const fetchMock = vi.fn().mockResolvedValueOnce(TOKEN());
    if (second instanceof Error) fetchMock.mockRejectedValueOnce(second);
    else fetchMock.mockResolvedValueOnce(second);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  describe("createMobilePayout", () => {
    it("posts a signed request in shillings and returns what ClickPesa said", async () => {
      const fetchMock = stub(json({ id: "CP1", status: "success", fee: 1500, orderReference: "PABC123" }));

      const outcome = await createMobilePayout(REQUEST);

      expect(outcome).toEqual({ ok: true, record: { status: "SUCCESS", id: "CP1", orderReference: "PABC123", feeTZS: 1500 } });
      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe("https://api.clickpesa.com/third-parties/payouts/create-mobile-money-payout");
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({ amount: 94_000, phoneNumber: "255754000111", currency: "TZS", orderReference: "PABC123" });
      const { checksum, ...signed } = body;
      expect(checksum).toBe(createChecksum(signed));
    });

    it("calls a 4xx a refusal: nothing was sent", async () => {
      stub(json({ message: "Insufficient balance" }, 400));
      await expect(createMobilePayout(REQUEST)).resolves.toMatchObject({ ok: false, reason: "refused", status: 400 });
    });

    it("keeps a repeated reference apart from a refusal: an earlier request did arrive", async () => {
      stub(json({ message: "Order reference PABC123 already used" }, 409));
      await expect(createMobilePayout(REQUEST)).resolves.toEqual({ ok: false, reason: "duplicate-reference" });
    });

    // The three answers that must never be mistaken for "not sent".
    it.each([
      ["a timeout", new Error("The operation was aborted due to timeout")],
      ["a 502", new Response("bad gateway", { status: 502 })],
      ["a 200 it cannot read", new Response("<html>", { status: 200 })],
    ])("reports %s as unknown, not as a refusal", async (_name, second) => {
      stub(second);
      await expect(createMobilePayout(REQUEST)).resolves.toMatchObject({ ok: false, reason: "unknown" });
    });

    it("sends nothing when it cannot get a token", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(new Response("", { status: 403 }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(createMobilePayout(REQUEST)).resolves.toMatchObject({ ok: false, reason: "auth-failed" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("previewMobilePayout", () => {
    it("returns the fee, the total and the balance", async () => {
      const fetchMock = stub(json({ amount: 95_500, balance: 500_000, fee: 1_500, channelProvider: "MPESA TANZANIA", receiver: { accountName: "TOYOTA DAR" } }));
      await expect(previewMobilePayout(REQUEST)).resolves.toEqual({ ok: true, feeTZS: 1_500, totalTZS: 95_500, balanceTZS: 500_000, receiverName: "TOYOTA DAR", provider: "MPESA TANZANIA" });
      expect(fetchMock.mock.calls[1][0]).toBe("https://api.clickpesa.com/third-parties/payouts/preview-mobile-money-payout");
    });

    it("passes on ClickPesa's reason when it would not send", async () => {
      stub(json({ message: "Insufficient balance: available balance is 100 TZS" }, 400));
      const outcome = await previewMobilePayout(REQUEST);
      expect(outcome).toMatchObject({ ok: false, reason: "refused", status: 400 });
      expect(outcome.ok === false && outcome.reason === "refused" && outcome.detail).toContain("Insufficient balance");
    });
  });

  describe("queryPayoutStatus", () => {
    it("reads the first payout under the reference", async () => {
      stub(json([{ id: "CP1", status: "REVERSED", orderReference: "PABC123", fee: "1500.00" }]));
      await expect(queryPayoutStatus("PABC123")).resolves.toEqual({ ok: true, found: true, record: { status: "REVERSED", id: "CP1", orderReference: "PABC123", feeTZS: 1500 } });
    });

    it.each([
      ["a 404", json({ message: "Invalid or missing payout: PABC123" }, 404)],
      ["a 400 saying the same", json({ message: "Invalid or missing payout:  PABC123" }, 400)],
      ["an empty list", json([])],
    ])("reads %s as 'no such payout', not as an error", async (_name, response) => {
      stub(response);
      await expect(queryPayoutStatus("PABC123")).resolves.toEqual({ ok: true, found: false });
    });

    it("reports a server error as a failed check", async () => {
      stub(new Response("oops", { status: 500 }));
      await expect(queryPayoutStatus("PABC123")).resolves.toMatchObject({ ok: false, reason: "request-failed" });
    });
  });

  describe("getAccountBalance", () => {
    it("returns the shilling balance", async () => {
      stub(json([{ currency: "USD", balance: 3 }, { currency: "TZS", balance: 10_000.5 }]));
      await expect(getAccountBalance()).resolves.toEqual({ ok: true, balanceTZS: 10_000.5 });
    });

    it("says when the merchant has no balance account yet", async () => {
      stub(json({ message: "No balance account is linked to this merchant yet." }, 404));
      await expect(getAccountBalance()).resolves.toEqual({ ok: false, reason: "no-account" });
    });
  });
});
