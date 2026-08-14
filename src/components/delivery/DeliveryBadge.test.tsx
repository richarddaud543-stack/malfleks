import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DeliveryBadge from "./DeliveryBadge";

describe("DeliveryBadge", () => {
  it("labels brand delivery in green when deliveryOffered is true", () => {
    render(<DeliveryBadge deliveryOffered />);
    const badge = screen.getByText("Brand delivery");
    expect(badge.className).toContain("text-emerald-400");
  });

  it("labels local agent delivery in amber when deliveryOffered is false", () => {
    render(<DeliveryBadge deliveryOffered={false} />);
    const badge = screen.getByText("Local agent delivery");
    expect(badge.className).toContain("text-amber-400");
  });
});
