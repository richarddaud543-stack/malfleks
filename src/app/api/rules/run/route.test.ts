// @vitest-environment node
//
// The door the outside timer knocks on. It cancels orders and sends money, so
// the first thing to prove is who it lets in; the second is that it answers
// the timer at once and never teaches it to stop calling.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runRulebook = vi.fn();
vi.mock("@/server/rules/engine", () => ({ runRulebook: (trigger: string) => runRulebook(trigger) }));

/** Work handed to `after()`: it runs once the response has been sent, so the tests run it by hand. */
let afterResponse: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (work: () => unknown) => afterResponse.push(work) }));

import { GET } from "./route";

const SECRET = "test-cron-secret";
const URL_BASE = "https://admin.example/api/rules/run";
const CLEAN_PASS = { ok: true, acted: 2, errors: 0, apiCalls: 3, summary: "Reminded two customers.", outcomes: [], runId: "run1", trigger: "timer" };

function call(headers: Record<string, string> = {}, query = ""): Promise<Response> {
  return GET(new Request(`${URL_BASE}${query}`, { headers }));
}
const withSecret = { authorization: `Bearer ${SECRET}` };

let savedSecret: string | undefined;

beforeEach(() => {
  savedSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SECRET;
  afterResponse = [];
  runRulebook.mockReset();
  runRulebook.mockResolvedValue(CLEAN_PASS);
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
});

describe("who may start a pass", () => {
  it.each([
    ["no Authorization header", {}],
    ["the wrong secret", { authorization: "Bearer not-the-secret" }],
    ["the secret without the word Bearer", { authorization: SECRET }],
    ["an empty bearer", { authorization: "Bearer " }],
  ])("refuses a call with %s, and runs nothing", async (_name, headers) => {
    const response = await call(headers as Record<string, string>);

    expect(response.status).toBe(401);
    expect(afterResponse).toEqual([]);
    expect(runRulebook).not.toHaveBeenCalled();
  });

  it.each([
    ["not set", undefined],
    ["empty", ""],
    ["only spaces", "   "],
  ])("refuses everyone when CRON_SECRET is %s -- it fails closed", async (_name, value) => {
    if (value === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = value;

    // Including a caller who sends exactly what an unset secret would compare to.
    for (const headers of [{}, { authorization: "Bearer " }, { authorization: "Bearer undefined" }, withSecret]) {
      expect((await call(headers as Record<string, string>)).status).toBe(401);
    }
    expect(runRulebook).not.toHaveBeenCalled();
  });
});

describe("the timer's call", () => {
  it("is answered at once, before the pass has run", async () => {
    const response = await call(withSecret);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, started: true });
    // Nothing has run yet: the timer service gives up after thirty seconds,
    // and a pass can take longer than that.
    expect(runRulebook).not.toHaveBeenCalled();
    expect(afterResponse).toHaveLength(1);
  });

  it("then runs exactly one pass, as the timer", async () => {
    await call(withSecret);
    await afterResponse[0]();

    expect(runRulebook).toHaveBeenCalledTimes(1);
    expect(runRulebook).toHaveBeenCalledWith("timer");
  });
});

describe("trying it by hand with ?wait=1", () => {
  it("runs the pass first and answers with what it did", async () => {
    const response = await call(withSecret, "?wait=1");

    expect(runRulebook).toHaveBeenCalledWith("timer");
    expect(afterResponse).toEqual([]);
    expect(await response.json()).toEqual({ ok: true, skipped: null, acted: 2, errors: 0, apiCalls: 3, summary: "Reminded two customers." });
  });

  it("still answers 200 when a rule failed -- the rulebook tells the owner itself", async () => {
    runRulebook.mockResolvedValue({ ...CLEAN_PASS, ok: false, errors: 1, summary: "Failed: refund-send." });

    const response = await call(withSecret, "?wait=1");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: false, errors: 1 });
  });

  it("says so when another pass was already running", async () => {
    runRulebook.mockResolvedValue({ ...CLEAN_PASS, skipped: "busy", acted: 0, summary: "Another pass is running." });

    expect(await (await call(withSecret, "?wait=1")).json()).toMatchObject({ skipped: "busy", acted: 0 });
  });

  it("is refused without the secret, like any other call", async () => {
    expect((await call({}, "?wait=1")).status).toBe(401);
    expect(runRulebook).not.toHaveBeenCalled();
  });

  it("treats any other value of wait as the ordinary timer call", async () => {
    const response = await call(withSecret, "?wait=0");

    expect(await response.json()).toEqual({ ok: true, started: true });
    expect(afterResponse).toHaveLength(1);
  });
});
