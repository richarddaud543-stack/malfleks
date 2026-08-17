import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import BrandMarquee from "./BrandMarquee";
import { brands } from "@/data";

const { useReducedMotion } = vi.hoisted(() => ({
  useReducedMotion: vi.fn<() => boolean>(),
}));

vi.mock("motion/react", () => ({ useReducedMotion }));
// GSAP itself isn't under test here (jsdom has no real paint loop to verify
// a visual loop against) — stubbed out so the assertions below are only
// about what BrandMarquee decides to render for each reduced-motion state,
// not about whether a rAF-driven tween ticks in a test environment.
vi.mock("@gsap/react", () => ({ useGSAP: vi.fn() }));
vi.mock("gsap", () => ({ default: { to: vi.fn() } }));

describe("BrandMarquee", () => {
  it("renders the track duplicated (two back-to-back copies) when motion is allowed, so the xPercent: -50 loop has a seam to land on", () => {
    useReducedMotion.mockReturnValue(false);

    render(<BrandMarquee brands={brands} />);

    for (const brand of brands) {
      expect(screen.getAllByAltText(brand.name)).toHaveLength(2);
    }
  });

  it("renders exactly one copy, with no loop, when motion is reduced", () => {
    useReducedMotion.mockReturnValue(true);

    render(<BrandMarquee brands={brands} />);

    for (const brand of brands) {
      expect(screen.getAllByAltText(brand.name)).toHaveLength(1);
    }
  });

  it("hides the whole strip from assistive tech — brand names are already spelled out in the hero copy, and a duplicated logo strip would otherwise announce each one twice", () => {
    useReducedMotion.mockReturnValue(false);

    const { container } = render(<BrandMarquee brands={brands} />);

    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});
