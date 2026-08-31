import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { DeliveryAgent } from "@/data";
import AgentCard from "./AgentCard";

/**
 * The one thing this card must never do: offer a number nobody answers.
 *
 * Until 2026-08-31 every seeded courier carried an invented phone number —
 * `+255 68 000 0001` through `0005`, a counting sequence — and this component
 * rendered each one as a `tel:` link. The deployed site was inviting customers
 * to dial numbers that did not exist, and two of those couriers wore a
 * "Verified" badge while doing it.
 *
 * The numbers are gone and `DeliveryAgent.phone` is optional now. These tests
 * hold both halves of the resulting contract, because only having the first
 * half is how the bug returns: render the link when there is a number, render
 * *no link at all* when there is not — not an empty `tel:`, not a dash, not a
 * "call us" with nothing after it.
 */

const base: DeliveryAgent = {
  id: "test-courier",
  name: "Test Courier",
  city: "Dar es Salaam",
  regionsServed: ["Dar es Salaam", "Pwani"],
  eta: { minDays: 1, maxDays: 2 },
  verified: true,
};

describe("AgentCard", () => {
  it("links the number when the courier publishes one", () => {
    render(<AgentCard agent={{ ...base, phone: "+255 22 000 0000" }} />);

    const link = screen.getByRole("link", { name: "+255 22 000 0000" });
    expect(link).toHaveAttribute("href", "tel:+255 22 000 0000");
  });

  // The case the file exists for.
  it("renders no link at all when the courier publishes none", () => {
    render(<AgentCard agent={base} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/No published number/)).toBeVisible();
  });

  it("never emits a tel: href built from an absent number", () => {
    const { container } = render(<AgentCard agent={base} />);

    // Catches the specific regression of `tel:undefined` / `tel:` — which
    // looks fine in a screenshot and dials nothing on a real phone.
    expect(container.innerHTML).not.toMatch(/tel:/);
  });

  it("still shows the courier's name, ETA and verified badge either way", () => {
    render(<AgentCard agent={base} />);

    expect(screen.getByText("Test Courier")).toBeVisible();
    expect(screen.getByText(/1–2 days/)).toBeVisible();
    expect(screen.getByText("Verified")).toBeVisible();
  });
});
