import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SignInPanel, { safeDestination } from "./SignInPanel";
import { invalidateSessionState } from "./session-state";

const replace = vi.fn();
let params = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
  useSearchParams: () => params,
}));

const isFirebaseConfigured = vi.fn(() => true);
vi.mock("@/lib/firebase", () => ({
  isFirebaseConfigured: () => isFirebaseConfigured(),
  getFirebaseAuth: vi.fn(),
}));

vi.mock("@/app/actions/auth", () => ({
  signInWithIdToken: vi.fn(),
}));

function mockSession(signedIn: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ signedIn, name: null }), { status: 200 })
    )
  );
}

describe("safeDestination", () => {
  /**
   * `?next=` is attacker-controllable. Every value below is a real open-redirect
   * payload, and each one has to come back as the safe default rather than be
   * handed to `router.replace`.
   */
  it("keeps an ordinary same-site path", () => {
    expect(safeDestination("/account")).toBe("/account");
    expect(safeDestination("/products/toyota-corolla")).toBe(
      "/products/toyota-corolla"
    );
  });

  it("refuses an absolute URL to another origin", () => {
    expect(safeDestination("https://evil.example/steal")).toBe("/account");
    expect(safeDestination("http://evil.example")).toBe("/account");
  });

  it("refuses a protocol-relative URL, which looks like a path", () => {
    // `//evil.example` starts with a slash and is a different site. This is the
    // one that gets missed.
    expect(safeDestination("//evil.example")).toBe("/account");
  });

  it("refuses the backslash form some browsers normalise to //", () => {
    expect(safeDestination("/\\evil.example")).toBe("/account");
  });

  it("falls back when there is no parameter at all", () => {
    expect(safeDestination(null)).toBe("/account");
    expect(safeDestination("")).toBe("/account");
  });
});

describe("SignInPanel", () => {
  beforeEach(() => {
    replace.mockClear();
    params = new URLSearchParams();
    isFirebaseConfigured.mockReturnValue(true);
    invalidateSessionState();
    mockSession(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers a keyboard-operable sign-in control with a real name", () => {
    render(<SignInPanel />);
    const button = screen.getByRole("button", { name: /Continue with Google/i });
    expect(button).toBeEnabled();
    // A <button>, so Tab reaches it and Enter/Space activate it without any
    // key handling of our own.
    expect(button.tagName).toBe("BUTTON");
  });

  it("keeps an alert region in the DOM so an error is announced", () => {
    render(<SignInPanel />);
    // Present from the start rather than appearing with the message: a live
    // region added at the same moment as its content is often not announced.
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("says sign-in is unavailable rather than failing, with no Firebase config", () => {
    isFirebaseConfigured.mockReturnValue(false);
    render(<SignInPanel />);

    expect(
      screen.getByText(/Sign-in isn't available on this deployment/i)
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Continue with Google/i })
    ).not.toBeInTheDocument();
  });

  it("tells a signed-out visitor they can order without an account", () => {
    render(<SignInPanel />);
    expect(screen.getByText(/don't need an account to order/i)).toBeVisible();
  });

  it("sends an already-signed-in visitor on to their account", async () => {
    mockSession(true);
    render(<SignInPanel />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account"));
  });

  it("honours a safe ?next= and ignores a hostile one", async () => {
    params = new URLSearchParams("next=//evil.example");
    mockSession(true);
    render(<SignInPanel />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account"));
  });
});
