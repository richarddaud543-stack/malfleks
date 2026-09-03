import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PartnerApplicationForm from "./PartnerApplicationForm";

/**
 * Two rules this file holds:
 *
 * 1. **A signed-out visitor sees no form** — the whole design rests on the
 *    applicant being a real account that later becomes the partner login, so a
 *    form that could be filled in signed-out would be a broken promise.
 * 2. **A courier is never asked about a brand or an address.** The chooser
 *    genuinely changes the questions rather than just the labels.
 *
 * `@testing-library/user-event` is not a dependency of this repo — `fireEvent`
 * only, matching every other component test here.
 */

const submitPartnerApplication = vi.fn();
vi.mock("@/app/actions/partner-applications", () => ({
  submitPartnerApplication: (...args: unknown[]) =>
    submitPartnerApplication(...args),
}));

const sessionState = vi.fn();
vi.mock("@/components/auth/session-state", () => ({
  useSessionState: () => sessionState(),
}));

/**
 * The form now asks where this account already stands before deciding what to
 * show. Mocked at the hook rather than at `fetch`, so these tests keep testing
 * the form's branching rather than an HTTP client — `partner-status.ts` owns
 * the request and can be wrong about it on its own time.
 *
 * Defaulted to "none" in `beforeEach`: most of this file is about the form
 * itself, and only the cases below care about the other states.
 */
const partnerStatus = vi.fn();
vi.mock("@/components/apply/partner-status", () => ({
  usePartnerStatus: () => partnerStatus(),
}));

const BRANDS = [
  { id: "toyota", name: "Toyota" },
  { id: "apple", name: "Apple" },
];

function renderForm() {
  return render(<PartnerApplicationForm brands={BRANDS} />);
}

const signedIn = { signedIn: true, name: "Asha", picture: null };
const signedOut = { signedIn: false, name: null, picture: null };

beforeEach(() => {
  submitPartnerApplication.mockReset();
  submitPartnerApplication.mockResolvedValue({ submitted: true });
  sessionState.mockReturnValue(signedIn);
  partnerStatus.mockReturnValue({ state: "none" });
});

/**
 * What the form shows an account that has already been here.
 *
 * Before this, all of these people saw the same blank form. The quota allows
 * five *pending* applications per account and nothing emails an applicant when
 * they are approved, so the natural response to that silence — apply again —
 * worked repeatedly, filling the review queue with duplicates of one business.
 * Each case below is a person the old page could not tell apart from a
 * stranger.
 */
describe("PartnerApplicationForm — an account that has already applied", () => {
  it("shows a pending application instead of a fresh form", () => {
    partnerStatus.mockReturnValue({
      state: "pending",
      submittedAt: "2026-08-14T09:00:00.000Z",
    });
    renderForm();

    expect(screen.getByText(/Your application is with us/i)).toBeVisible();
    // The date matters: "we have it" is only reassuring if they can see it is
    // the one they sent.
    expect(screen.getByText(/14 August 2026/)).toBeVisible();
    // And the sentence that stops the duplicate.
    expect(screen.getByText(/do not need to send another one/i)).toBeVisible();
    expect(screen.queryByLabelText(/branch or shop name/i)).toBeNull();
  });

  it("sends an approved partner to their partner area, not to the form", () => {
    partnerStatus.mockReturnValue({ state: "partner", live: true, kind: "brand" });
    renderForm();

    expect(screen.getByText(/already a MalFleks partner/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /partner area/i })).toHaveAttribute(
      "href",
      "/partner"
    );
    expect(screen.queryByLabelText(/branch or shop name/i)).toBeNull();
  });

  // The state most likely to look like a broken site: approved, with an
  // account, but not yet through the separate "Put on the map" step — so they
  // cannot list anything and nothing has told them why.
  it("names the gap between approved and on the map", () => {
    partnerStatus.mockReturnValue({ state: "partner", live: false, kind: "brand" });
    renderForm();

    expect(screen.getByText(/not put you on the map yet/i)).toBeVisible();
    expect(screen.getByText(/do not need to apply again/i)).toBeVisible();
  });

  it("lets a turned-down applicant apply again, and says why the form is back", () => {
    partnerStatus.mockReturnValue({ state: "rejected", reviewedAt: null });
    renderForm();

    expect(screen.getByText(/not able to take it on/i)).toBeVisible();
    // The form is still there — the quota counts only pending rows, so
    // re-applying is allowed and pretending otherwise would be a lie.
    expect(screen.getByLabelText(/branch or shop name/i)).toBeVisible();
  });

  it("holds the space while the answer is still in flight", () => {
    // Rendering the form and then swapping it for a status card would show a
    // stranger's form to a partner for a frame, and jump the page.
    partnerStatus.mockReturnValue(undefined);
    renderForm();

    expect(screen.queryByLabelText(/branch or shop name/i)).toBeNull();
    expect(screen.queryByText(/Your application is with us/i)).toBeNull();
  });
});

describe("PartnerApplicationForm", () => {
  it("shows a sign-in prompt and no form when signed out", () => {
    sessionState.mockReturnValue(signedOut);
    renderForm();

    expect(
      screen.getByRole("link", { name: /sign in to continue/i })
    ).toHaveAttribute("href", "/sign-in?next=/apply");
    expect(
      screen.queryByRole("button", { name: /send application/i })
    ).not.toBeInTheDocument();
  });

  it("asks a brand branch for its brand and address", () => {
    renderForm();
    expect(screen.getByLabelText(/which brand do you sell/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/street and area/i)).toBeInTheDocument();
  });

  it("asks a courier neither", () => {
    renderForm();
    fireEvent.click(screen.getByRole("radio", { name: /delivery courier/i }));

    expect(
      screen.queryByLabelText(/which brand do you sell/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/street and area/i)).not.toBeInTheDocument();
    // The city question survives the switch, reworded for a courier.
    expect(screen.getByLabelText(/which city do you cover/i)).toBeInTheDocument();
  });

  it("announces problems and does not call the action", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /send application/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /check the highlighted answers/i
    );
    expect(submitPartnerApplication).not.toHaveBeenCalled();
  });

  it("sends a complete courier application and confirms it", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("radio", { name: /delivery courier/i }));
    fireEvent.change(screen.getByLabelText(/courier business name/i), {
      target: { value: "Arusha Swift Couriers" },
    });
    fireEvent.change(screen.getByLabelText(/who should we speak to/i), {
      target: { value: "Asha Mwenda" },
    });
    fireEvent.change(screen.getByLabelText(/phone number/i), {
      target: { value: "0754123456" },
    });
    fireEvent.change(screen.getByLabelText(/which city do you cover/i), {
      target: { value: "Arusha" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send application/i }));

    await waitFor(() => expect(submitPartnerApplication).toHaveBeenCalledTimes(1));
    expect(submitPartnerApplication).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "courier", city: "Arusha" })
    );
    expect(await screen.findByText(/application received/i)).toBeInTheDocument();
  });

  it("keeps the answers on screen when the server cannot record it", async () => {
    // There is no browser-side copy of an application, so losing what they
    // typed would mean losing the application itself.
    submitPartnerApplication.mockResolvedValue({
      submitted: false,
      reason: "unavailable",
    });
    renderForm();
    fireEvent.click(screen.getByRole("radio", { name: /delivery courier/i }));
    fireEvent.change(screen.getByLabelText(/courier business name/i), {
      target: { value: "Arusha Swift Couriers" },
    });
    fireEvent.change(screen.getByLabelText(/who should we speak to/i), {
      target: { value: "Asha Mwenda" },
    });
    fireEvent.change(screen.getByLabelText(/phone number/i), {
      target: { value: "0754123456" },
    });
    fireEvent.change(screen.getByLabelText(/which city do you cover/i), {
      target: { value: "Arusha" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send application/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't record/i);
    expect(screen.getByLabelText(/courier business name/i)).toHaveValue(
      "Arusha Swift Couriers"
    );
  });
});
