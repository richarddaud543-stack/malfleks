// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const createServerSupabase = vi.fn();

vi.mock("@/server/auth/supabase", () => ({
  createServerSupabase: () => createServerSupabase(),
}));

const { GET } = await import("./route");

/**
 * The OAuth callback, and specifically the one thing about it that is a
 * security control rather than plumbing.
 *
 * `SignInPanel` already ran `safeDestination` on `?next=` before handing it to
 * Google. Between that moment and this one the value **left our origin and came
 * back**, so at this handler it is attacker-supplied again — and a crafted link
 * (`/auth/callback?next=//evil.example&code=…`) reaches here without the panel
 * ever running. Validating twice is not belt-and-braces; the second check is
 * the only one that covers the attack.
 *
 * The rest of these cases exist because every unhappy path has to land the
 * visitor somewhere they can act on, rather than on a stack trace: a declined
 * consent screen, a missing or reused code, an unconfigured deployment.
 */

function request(query: string): Request {
  return new Request(`https://soko.example/auth/callback${query}`);
}

/** Where a `Response` redirect actually points. */
function location(response: Response): string {
  return response.headers.get("location") ?? "";
}

beforeEach(() => {
  exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  createServerSupabase.mockReset().mockResolvedValue({
    auth: { exchangeCodeForSession },
  });
});

describe("open redirects", () => {
  // The case the whole file exists for.
  it("refuses a protocol-relative next, which looks like a path", async () => {
    const response = await GET(request("?code=abc&next=//evil.example") as never);
    expect(location(response)).toBe("https://soko.example/account");
  });

  it("refuses an absolute URL to another origin", async () => {
    const response = await GET(request("?code=abc&next=https://evil.example/steal") as never);
    expect(location(response)).toBe("https://soko.example/account");
  });

  it("refuses the backslash form some browsers normalise to //", async () => {
    const response = await GET(request("?code=abc&next=/%5Cevil.example") as never);
    expect(location(response)).toBe("https://soko.example/account");
  });

  it("honours an ordinary same-site path", async () => {
    const response = await GET(request("?code=abc&next=/admin/orders") as never);
    expect(location(response)).toBe("https://soko.example/admin/orders");
  });

  it("falls back to /account when there is no next at all", async () => {
    const response = await GET(request("?code=abc") as never);
    expect(location(response)).toBe("https://soko.example/account");
  });
});

describe("failure paths", () => {
  it("reports a declined consent screen as cancelled, and exchanges nothing", async () => {
    const response = await GET(request("?error=access_denied") as never);
    expect(location(response)).toBe("https://soko.example/sign-in?error=cancelled");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("sends a request with no code back to sign-in", async () => {
    const response = await GET(request("") as never);
    expect(location(response)).toBe("https://soko.example/sign-in?error=failed");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("says unconfigured rather than throwing when there is no client", async () => {
    createServerSupabase.mockResolvedValue(null);
    const response = await GET(request("?code=abc") as never);
    expect(location(response)).toBe("https://soko.example/sign-in?error=unconfigured");
  });

  // An expired or already-used code. Supabase reports it as an error rather
  // than by throwing, so a missing check here would redirect the visitor to
  // /account with no session and no explanation.
  it("sends a refused exchange back to sign-in", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("invalid grant") });
    const response = await GET(request("?code=stale&next=/admin") as never);
    expect(location(response)).toBe("https://soko.example/sign-in?error=failed");
  });
});

describe("the happy path", () => {
  it("exchanges exactly the code it was given", async () => {
    await GET(request("?code=one-time-code&next=/account") as never);
    expect(exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
  });
});
