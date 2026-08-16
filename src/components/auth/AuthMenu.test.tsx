import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import AuthMenu from "./AuthMenu";
import { invalidateSessionState } from "./session-state";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const signOut = vi.fn();
vi.mock("@/app/actions/auth", () => ({
  signOut: () => signOut(),
}));

function mockSession(signedIn: boolean, name: string | null = null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ signedIn, name, picture: null }), {
        status: 200,
      })
    )
  );
}

describe("AuthMenu", () => {
  beforeEach(() => {
    refresh.mockClear();
    signOut.mockReset().mockResolvedValue(undefined);
    invalidateSessionState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers a link to sign in when nobody is signed in", async () => {
    mockSession(false);
    render(<AuthMenu />);

    const link = await screen.findByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "/sign-in");
  });

  it("shows the account link and a way out when someone is", async () => {
    mockSession(true, "Neema Mushi");
    render(<AuthMenu />);

    // First name only in a nav pill; the full name belongs on /account.
    const link = await screen.findByRole("link", { name: "Neema" });
    expect(link).toHaveAttribute("href", "/account");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  });

  it("falls back to a label when the provider gave no name", async () => {
    mockSession(true, null);
    render(<AuthMenu />);
    expect(await screen.findByRole("link", { name: "My account" })).toBeVisible();
  });

  it("signs out and refreshes the tree", async () => {
    mockSession(true, "Neema Mushi");
    render(<AuthMenu />);

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows nothing clickable while the answer is still unknown", () => {
    // Rather than flashing "Sign in" at someone who is in fact signed in.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<AuthMenu />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("treats an unreachable session endpoint as signed out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<AuthMenu />);
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeVisible();
  });
});
