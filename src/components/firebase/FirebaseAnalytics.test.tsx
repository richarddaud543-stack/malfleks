import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import FirebaseAnalytics from "./FirebaseAnalytics";
import ConsentBanner from "@/components/consent/ConsentBanner";
import { resetConsentStateForTests } from "@/components/consent/consent-state";
import { CONSENT_STORAGE_KEY } from "@/lib/consent";

const initAnalytics = vi.fn(async () => null);
vi.mock("@/lib/firebase", () => ({
  initAnalytics: () => initAnalytics(),
}));

beforeEach(() => {
  window.localStorage.clear();
  resetConsentStateForTests();
  initAnalytics.mockClear();
});

describe("FirebaseAnalytics", () => {
  // This is the whole feature in one assertion: an undecided visitor is not a
  // consenting one, and Analytics must not start for them.
  it("does not start for a visitor who has not decided", () => {
    render(<FirebaseAnalytics />);
    expect(initAnalytics).not.toHaveBeenCalled();
  });

  it("does not start for a visitor who declined", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "denied");
    render(<FirebaseAnalytics />);
    expect(initAnalytics).not.toHaveBeenCalled();
  });

  it("starts for a visitor who granted", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    render(<FirebaseAnalytics />);
    expect(initAnalytics).toHaveBeenCalledTimes(1);
  });

  it("starts as soon as consent is given, without a reload", () => {
    render(
      <>
        <ConsentBanner />
        <FirebaseAnalytics />
      </>
    );
    expect(initAnalytics).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    expect(initAnalytics).toHaveBeenCalledTimes(1);
  });
});
