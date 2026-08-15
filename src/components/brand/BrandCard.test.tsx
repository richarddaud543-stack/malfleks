import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Branch, Brand } from "@/data";
import BrandCard, { summarizeDeliveryMix } from "./BrandCard";

const { getBranchesByBrandId } = vi.hoisted(() => ({
  getBranchesByBrandId: vi.fn<(brandId: string) => Branch[]>(),
}));

vi.mock("@/data", () => ({
  getBranchesByBrandId,
}));

function branch(id: string, deliveryOffered: boolean): Branch {
  return {
    id,
    brandId: "acme",
    name: `Branch ${id}`,
    city: "Dar es Salaam",
    region: "Dar es Salaam",
    addressLine: "1 Test Road",
    country: "Tanzania",
    hours: "Mon–Sat 09:00–18:00",
    deliveryOffered,
    verified: true,
  };
}

const brand: Brand = {
  id: "acme",
  slug: "acme",
  name: "Acme",
  category: "electronics",
  logo: "/images/brands/acme.svg",
  accentColor: "#123456",
  description: "Acme sells things.",
};

describe("summarizeDeliveryMix", () => {
  it("returns null when the brand has no branches, so nothing renders", () => {
    expect(summarizeDeliveryMix([])).toBeNull();
  });

  it("never produces '1 of 1 branches' — states the fact directly for a single delivering branch", () => {
    const result = summarizeDeliveryMix([branch("a", true)]);
    expect(result?.text).toBe("Delivers directly");
    expect(result?.text).not.toMatch(/of 1/);
    expect(result?.tone).toBe("positive");
  });

  it("never produces '1 of 1 branches' — states the fact directly for a single non-delivering branch", () => {
    const result = summarizeDeliveryMix([branch("a", false)]);
    expect(result?.text).toBe("Local courier delivery");
    expect(result?.text).not.toMatch(/of 1/);
    expect(result?.tone).toBe("caution");
  });

  it("states plainly when every branch delivers, without a redundant tally", () => {
    const result = summarizeDeliveryMix([
      branch("a", true),
      branch("b", true),
      branch("c", true),
    ]);
    expect(result?.text).toBe("Delivers directly at all 3 branches");
    expect(result?.tone).toBe("positive");
  });

  it("states plainly when no branch delivers, without a redundant tally", () => {
    const result = summarizeDeliveryMix([
      branch("a", false),
      branch("b", false),
    ]);
    expect(result?.text).toBe("No branches deliver directly");
    expect(result?.tone).toBe("caution");
  });

  it("gives the exact X of Y tally for a genuine mix, derived from the data given", () => {
    expect(
      summarizeDeliveryMix([branch("a", true), branch("b", false), branch("c", false)])
    ).toEqual({ text: "1 of 3 branches deliver directly", tone: "caution" });

    // Different input, different derived output — proves this isn't hardcoded.
    expect(
      summarizeDeliveryMix([
        branch("a", true),
        branch("b", true),
        branch("c", false),
        branch("d", false),
        branch("e", false),
      ])
    ).toEqual({ text: "2 of 5 branches deliver directly", tone: "caution" });
  });
});

describe("BrandCard delivery-mix indicator", () => {
  it("renders the derived mix as visible text, not just a colour, and without needing hover", () => {
    getBranchesByBrandId.mockReturnValue([
      branch("a", true),
      branch("b", false),
      branch("c", false),
    ]);

    render(<BrandCard brand={brand} />);

    const badge = screen.getByText("1 of 3 branches deliver directly");
    expect(badge).toBeVisible();
    expect(badge.className).toContain("text-amber-400");
  });

  it("switches to the positive tone and copy when every branch delivers", () => {
    getBranchesByBrandId.mockReturnValue([branch("a", true), branch("b", true)]);

    render(<BrandCard brand={brand} />);

    const badge = screen.getByText("Delivers directly at all 2 branches");
    expect(badge.className).toContain("text-emerald-400");
  });

  it("renders no delivery-mix indicator when the brand has no branch data", () => {
    getBranchesByBrandId.mockReturnValue([]);

    render(<BrandCard brand={brand} />);

    expect(screen.queryByText(/deliver/i)).not.toBeInTheDocument();
    // The rest of the card still renders normally.
    expect(screen.getByRole("heading", { name: "Acme" })).toBeVisible();
  });

  it("still renders the brand name as a level-3 heading, matching the /brands page smoke test", () => {
    getBranchesByBrandId.mockReturnValue([branch("a", true)]);

    render(<BrandCard brand={brand} />);

    expect(screen.getByRole("heading", { level: 3, name: "Acme" })).toBeVisible();
  });
});
