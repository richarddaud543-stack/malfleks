import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConsentBanner from "./ConsentBanner";
import ConsentPreferencesButton from "./ConsentPreferencesButton";
import { resetConsentStateForTests } from "./consent-state";
import { CONSENT_STORAGE_KEY } from "@/lib/consent";

beforeEach(() => {
  window.localStorage.clear();
  resetConsentStateForTests();
});

describe("ConsentBanner", () => {
  it("asks a visitor who has not decided", () => {
    render(<ConsentBanner />);
    expect(screen.getByTestId("consent-banner")).toBeVisible();
  });

  it("offers declining on the first layer, in one click", () => {
    render(<ConsentBanner />);

    // Not behind a "manage preferences" step: both answers are right here.
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));

    expect(screen.queryByTestId("consent-banner")).toBeNull();
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe("denied");
  });

  it("records a grant", () => {
    render(<ConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    expect(screen.queryByTestId("consent-banner")).toBeNull();
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe("granted");
  });

  it("gives both answers identical styling", () => {
    render(<ConsentBanner />);

    // Unequal prominence is the most-cited consent dark pattern, and
    // regulators treat it as no consent at all — so this is a correctness
    // assertion, not a cosmetic one.
    const allow = screen.getByRole("button", { name: "Allow" });
    const decline = screen.getByRole("button", { name: "No thanks" });
    expect(decline.className).toBe(allow.className);
  });

  it("stays quiet for someone who already answered", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "denied");
    render(<ConsentBanner />);
    expect(screen.queryByTestId("consent-banner")).toBeNull();
  });

  it("is a labelled region, not a modal dialog", () => {
    render(<ConsentBanner />);
    // `role="dialog"` would promise modality and a focus contract this does
    // not have — the site stays usable for someone who ignores the banner.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("region", { name: /count your visit/i })
    ).toBeVisible();
  });
});

describe("withdrawing consent", () => {
  it("reports the current choice and reopens the question", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    render(
      <>
        <ConsentBanner />
        <ConsentPreferencesButton />
      </>
    );

    expect(screen.getByTestId("consent-preferences")).toHaveTextContent(
      "Analytics: allowed"
    );
    expect(screen.queryByTestId("consent-banner")).toBeNull();

    fireEvent.click(screen.getByTestId("consent-preferences"));

    // Withdrawing must be as easy as granting: one click, from every page.
    expect(screen.getByTestId("consent-banner")).toBeVisible();
    // The stored yes is dropped immediately, so closing the tab mid-withdrawal
    // does not quietly keep a consent the visitor was revoking.
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
  });

  it("says so when nothing has been chosen yet", () => {
    render(<ConsentPreferencesButton />);
    expect(screen.getByTestId("consent-preferences")).toHaveTextContent(
      "Analytics: not set"
    );
  });
});
