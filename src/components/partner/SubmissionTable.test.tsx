import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { PartnerSubmission } from "@/server/partners/portal";
import SubmissionTable from "./SubmissionTable";

/**
 * What a partner is owed when they look at their own listings.
 *
 * The two failures this file exists to prevent are both about telling someone
 * their product is somewhere it isn't:
 *
 * 1. A pending submission reading as if it were live. Nothing a partner
 *    submits is visible to a customer until an admin publishes it, and a
 *    partner who believes otherwise stops chasing it.
 * 2. A rejection with no reason. `decisionNote` is the only place the reason
 *    exists — drop it from the render and the partner resubmits the same
 *    product forever, with nobody able to say why it keeps coming back.
 */

const base: PartnerSubmission = {
  id: "sub-1",
  name: "Corolla Hybrid 2024",
  category: "Cars",
  priceTZS: 48_500_000,
  image: "sedan",
  inStock: true,
  status: "pending",
  createdAt: new Date("2026-08-20T09:00:00Z"),
  reviewedAt: null,
  decisionNote: null,
  publishedProductId: null,
};

describe("SubmissionTable", () => {
  it("says nothing is listed yet, and why that is not a fault", () => {
    render(<SubmissionTable submissions={[]} />);

    expect(screen.getByText("Nothing listed yet")).toBeVisible();
    expect(screen.getByText(/until MalFleks publishes it/)).toBeVisible();
  });

  it("shows a pending listing as waiting on MalFleks, not as live", () => {
    render(<SubmissionTable submissions={[base]} />);

    expect(screen.getByText("Waiting on MalFleks")).toBeVisible();
    expect(screen.queryByText("Live on MalFleks")).not.toBeInTheDocument();
    // No link either: there is no page for it yet, and offering one would be
    // a 404 dressed as progress.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the name, category and price as submitted", () => {
    render(<SubmissionTable submissions={[base]} />);

    expect(screen.getByText("Corolla Hybrid 2024")).toBeVisible();
    expect(screen.getByText(/Cars/)).toBeVisible();
    expect(screen.getByText(/48,500,000/)).toBeVisible();
  });

  // The case the file exists for.
  it("gives the reason when a listing was sent back", () => {
    render(
      <SubmissionTable
        submissions={[
          {
            ...base,
            status: "rejected",
            reviewedAt: new Date("2026-08-21T09:00:00Z"),
            decisionNote: "We need the registration year in the details.",
          },
        ]}
      />,
    );

    expect(screen.getByText("Sent back to you")).toBeVisible();
    expect(
      screen.getByText("We need the registration year in the details."),
    ).toBeVisible();
  });

  it("still explains a rejection that arrived with no note", () => {
    render(
      <SubmissionTable
        submissions={[{ ...base, status: "rejected", decisionNote: "   " }]}
      />,
    );

    // A blank note must not render as blank space the partner has to interpret.
    expect(screen.getByText(/without leaving a reason/)).toBeVisible();
  });

  it("links a published listing to the live product page", () => {
    render(
      <SubmissionTable
        submissions={[
          {
            ...base,
            status: "published",
            publishedProductId: "sub-abc",
            reviewedAt: new Date("2026-08-21T09:00:00Z"),
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "See it on MalFleks" })).toHaveAttribute(
      "href",
      "/products/sub-abc",
    );
  });

  it("offers no link for a published listing whose product id is missing", () => {
    render(
      <SubmissionTable
        submissions={[{ ...base, status: "published", publishedProductId: null }]}
      />,
    );

    expect(screen.getByText("Live on MalFleks")).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the partner's own main photo when they sent one, and the icon when they did not", () => {
    const photoUrl =
      "https://p.supabase.co/storage/v1/object/public/product-photos/uid-1/front.webp";
    const { container, rerender } = render(
      <SubmissionTable submissions={[{ ...base, photoUrl }]} />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(decodeURIComponent(img?.getAttribute("src") ?? "")).toContain("front.webp");
    // The photo replaces the icon rather than sitting beside it.
    expect(container.querySelector("svg")).toBeNull();

    rerender(<SubmissionTable submissions={[{ ...base, photoUrl: null }]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("marks a listing the partner flagged as out of stock", () => {
    render(<SubmissionTable submissions={[{ ...base, inStock: false }]} />);

    expect(screen.getByText(/Marked out of stock/)).toBeVisible();
  });
});
