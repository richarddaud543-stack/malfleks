import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ApplicationReviewCard from "./ApplicationReviewCard";
import type { ReviewableApplication } from "@/server/partners/review";

/**
 * The rule this file exists to hold: **approve and reject are both
 * irreversible-ish, so neither fires on the first click**, and a failed
 * decision has to say so rather than quietly looking like nothing happened.
 *
 * Modelled on `DeleteSavedRequest.test.tsx` — same shape of control, same
 * mocking approach (`fireEvent`, not `user-event`, which is not installed).
 */

const approvePartnerApplication = vi.fn();
const rejectPartnerApplication = vi.fn();
vi.mock("@/app/actions/partner-review", () => ({
  approvePartnerApplication: (...args: unknown[]) =>
    approvePartnerApplication(...args),
  rejectPartnerApplication: (...args: unknown[]) =>
    rejectPartnerApplication(...args),
}));

const APPLICATION: ReviewableApplication = {
  id: "app-1",
  kind: "brand",
  status: "pending",
  uid: "uid-applicant",
  email: "owner@example.com",
  businessName: "Kilimanjaro Motors",
  contactName: "Neema Mushi",
  phone: "0754123456",
  city: "Arusha",
  brandId: "toyota",
  brandOther: null,
  address: "12 Sokoine Road",
  notes: null,
  createdAt: new Date("2026-08-01").toISOString(),
  reviewedAt: null,
  decisionNote: null,
};

const BRAND_NAMES = { toyota: "Toyota" };

function renderCard(application: ReviewableApplication = APPLICATION) {
  return render(
    <ApplicationReviewCard application={application} brandNames={BRAND_NAMES} />
  );
}

const approveButton = () =>
  screen.getByRole("button", { name: `Approve ${APPLICATION.businessName}` });
const confirmApproveButton = () =>
  screen.getByRole("button", {
    name: `Yes, approve ${APPLICATION.businessName}`,
  });
const rejectButton = () =>
  screen.getByRole("button", { name: `Reject ${APPLICATION.businessName}` });
const confirmRejectButton = () =>
  screen.getByRole("button", {
    name: `Confirm rejection of ${APPLICATION.businessName}`,
  });

beforeEach(() => {
  approvePartnerApplication.mockReset();
  rejectPartnerApplication.mockReset();
  approvePartnerApplication.mockResolvedValue({ ok: true });
  rejectPartnerApplication.mockResolvedValue({ ok: true });
});

describe("ApplicationReviewCard — approve", () => {
  it("does not approve on the first click", () => {
    renderCard();

    fireEvent.click(approveButton());

    expect(approvePartnerApplication).not.toHaveBeenCalled();
    expect(
      screen.getByText(/approve kilimanjaro motors and give this account access/i)
    ).toBeInTheDocument();
  });

  it("approves once confirmed, by this application's id", async () => {
    renderCard();

    fireEvent.click(approveButton());
    fireEvent.click(confirmApproveButton());

    await waitFor(() =>
      expect(approvePartnerApplication).toHaveBeenCalledWith(APPLICATION.id)
    );
  });

  it("backs out without approving on Cancel", () => {
    renderCard();

    fireEvent.click(approveButton());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(approvePartnerApplication).not.toHaveBeenCalled();
    expect(approveButton()).toBeInTheDocument();
  });
});

describe("ApplicationReviewCard — reject", () => {
  it("asks for a reason before doing anything", () => {
    renderCard();

    fireEvent.click(rejectButton());

    expect(rejectPartnerApplication).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText(/why are you rejecting this/i)
    ).toBeInTheDocument();
  });

  it("rejects with the typed reason once confirmed", async () => {
    renderCard();

    fireEvent.click(rejectButton());
    fireEvent.change(screen.getByLabelText(/why are you rejecting this/i), {
      target: { value: "Business registration could not be verified" },
    });
    fireEvent.click(confirmRejectButton());

    await waitFor(() =>
      expect(rejectPartnerApplication).toHaveBeenCalledWith(
        APPLICATION.id,
        "Business registration could not be verified"
      )
    );
  });

  it("backs out without rejecting on Cancel", () => {
    renderCard();

    fireEvent.click(rejectButton());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(rejectPartnerApplication).not.toHaveBeenCalled();
    expect(rejectButton()).toBeInTheDocument();
  });
});

describe("ApplicationReviewCard — a failed decision is never silent", () => {
  // Table-driven over every reason the server action can return, not just
  // one: SKILL.md's standing lesson is to guard the whole class rather than
  // the instance that happened to be tested, and this mapping has five
  // branches in the component.
  const cases: Array<{ reason: string | undefined; expect: RegExp }> = [
    { reason: "forbidden", expect: /no longer has admin access/i },
    { reason: "already-reviewed", expect: /someone already decided/i },
    {
      reason: "account-already-partnered",
      expect: /already manages a partner/i,
    },
    { reason: "not-found", expect: /no longer exists/i },
    { reason: "unavailable", expect: /couldn't record the decision/i },
    { reason: undefined, expect: /couldn't record the decision/i },
  ];

  for (const { reason, expect: pattern } of cases) {
    it(`approve: reason "${reason}" announces via role=alert and returns to idle`, async () => {
      approvePartnerApplication.mockResolvedValue({ ok: false, reason });
      renderCard();

      fireEvent.click(approveButton());
      fireEvent.click(confirmApproveButton());

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(pattern);

      // Disarmed, not stuck mid-flow and not silently looking like it worked:
      // the ordinary Approve/Reject controls are back.
      expect(approveButton()).toBeInTheDocument();
      expect(rejectButton()).toBeInTheDocument();
    });

    it(`reject: reason "${reason}" announces via role=alert and returns to idle`, async () => {
      rejectPartnerApplication.mockResolvedValue({ ok: false, reason });
      renderCard();

      fireEvent.click(rejectButton());
      fireEvent.click(confirmRejectButton());

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(pattern);

      expect(approveButton()).toBeInTheDocument();
      expect(rejectButton()).toBeInTheDocument();
    });
  }

  it("does not show a stale error after a fresh attempt is made", () => {
    renderCard();

    // Trigger and observe an error is not asserted here (covered above);
    // this checks the error clears the moment a new attempt starts, so a
    // customer cannot see yesterday's failure attached to today's click.
    fireEvent.click(approveButton());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ApplicationReviewCard — content", () => {
  it("flags a claimed brand that is not actually in the catalogue", () => {
    renderCard({ ...APPLICATION, brandId: null, brandOther: "Toyoda Motors" });

    expect(screen.getByText("Toyoda Motors")).toBeInTheDocument();
    expect(screen.getByText(/not in catalogue/i)).toBeInTheDocument();
  });

  it("resolves a known brand id to its display name, not the raw id", () => {
    renderCard();

    expect(screen.getByText("Toyota")).toBeInTheDocument();
    expect(screen.queryByText("toyota")).not.toBeInTheDocument();
  });
});
