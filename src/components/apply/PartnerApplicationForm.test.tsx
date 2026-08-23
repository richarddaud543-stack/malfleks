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
