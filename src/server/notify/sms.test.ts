// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { deliveryCodeSms, isSmsConfigured, sendSms, toSmsNumber } from "./sms";

const ENV = { BEEM_API_KEY: "key", BEEM_SECRET_KEY: "secret", SMS_SENDER_ID: "MalFleks" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toSmsNumber", () => {
  it.each([
    ["0754123456", "255754123456"],
    ["+255 754 123 456", "255754123456"],
    ["255-629-264-383", "255629264383"],
    ["754123456", "255754123456"],
  ])("reads %s as %s", (raw, expected) => {
    expect(toSmsNumber(raw)).toBe(expected);
  });

  it.each(["", null, undefined, "022 211 0000", "12345", "+44 7700 900123", "0754123"])("refuses %j rather than text a wrong number", (raw) => {
    expect(toSmsNumber(raw)).toBeNull();
  });
});

describe("deliveryCodeSms", () => {
  const text = deliveryCodeSms({ reference: "ORA-DOD-N6CD", code: "482913" });

  it("carries the code and the reference", () => {
    expect(text).toContain("482913");
    expect(text).toContain("ORA-DOD-N6CD");
  });

  it("fits in one plain text message", () => {
    expect(text.length).toBeLessThanOrEqual(160);
    // One character outside basic ASCII would switch the whole message to a
    // 70-character encoding and split it in three.
    expect(text).toMatch(/^[\x20-\x7E]+$/);
  });

  it("says in both languages to give it only once the goods have arrived", () => {
    expect(text).toContain("UKISHAPOKEA");
    expect(text).toContain("only once you have your goods");
  });
});

describe("sendSms", () => {
  it("sends nothing, and says so, until all three settings exist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const env of [{}, { BEEM_API_KEY: "key", BEEM_SECRET_KEY: "secret" }, { ...ENV, SMS_SENDER_ID: "  " }]) {
      expect(isSmsConfigured(env)).toBe(false);
      await expect(sendSms("0754123456", "hello", env)).resolves.toEqual({ sent: false, reason: "not-configured" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the provider for a number that is not a Tanzanian mobile", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendSms("022 211 0000", "hello", ENV)).resolves.toEqual({ sent: false, reason: "no-number" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the message to Beem with the sender name and the number in international form", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ successful: true, code: 100, valid: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendSms("0754 123 456", "your code", ENV)).resolves.toEqual({ sent: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://apisms.beem.africa/v1/send");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("key:secret").toString("base64")}`);
    expect(JSON.parse(init.body)).toEqual({ source_addr: "MalFleks", message: "your code", encoding: 0, recipients: [{ recipient_id: 1, dest_addr: "255754123456" }] });
  });

  it("reports a refusal, such as a sender name that is not approved", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 111, message: "Invalid Sender ID" }), { status: 400 })));
    const result = await sendSms("0754123456", "x", ENV);
    expect(result).toMatchObject({ sent: false, reason: "rejected" });
    expect(result.sent === false && result.detail).toContain("Invalid Sender ID");
  });

  it("reports a 200 that accepted no recipient as a refusal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ successful: true, valid: 0, message: "No valid recipients" }), { status: 200 })));
    await expect(sendSms("0754123456", "x", ENV)).resolves.toMatchObject({ sent: false, reason: "rejected" });
  });

  it("never throws when the network does", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket hang up")));
    await expect(sendSms("0754123456", "x", ENV)).resolves.toEqual({ sent: false, reason: "failed", detail: "socket hang up" });
  });
});
