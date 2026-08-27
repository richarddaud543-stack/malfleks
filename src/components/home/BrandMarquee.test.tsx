import { describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

  // Updated 2026-08-27. This case used to assert one copy under reduced
  // motion, which is what the component did — and it was a hydration bug:
  // `useReducedMotion()` is `false` during SSR and `true` in a reduced-motion
  // browser, so the server sent two copies and the client expected one, and
  // React discarded the tree (#418). These tests could never have caught it,
  // because they mock the hook and render each branch in isolation — there is
  // no server render to disagree with.
  //
  // The markup is now identical in both states and CSS hides the clone. What
  // this case can still assert is the property that actually prevents the bug:
  // the rendered output does not depend on the hook at all.
  it("renders the same markup whatever the reduced-motion preference, so SSR and the client cannot disagree", () => {
    useReducedMotion.mockReturnValue(false);
    const { container: allowed } = render(<BrandMarquee brands={brands} />);
    const allowedHtml = allowed.innerHTML;

    cleanup();

    useReducedMotion.mockReturnValue(true);
    const { container: reduced } = render(<BrandMarquee brands={brands} />);

    expect(reduced.innerHTML).toBe(allowedHtml);
  });

  it("marks the second copy as a clone so CSS can drop it when nothing is looping", () => {
    useReducedMotion.mockReturnValue(true);

    const { container } = render(<BrandMarquee brands={brands} />);

    expect(container.querySelectorAll("[data-marquee-clone='true']")).toHaveLength(
      brands.length,
    );
  });

  it("hides the whole strip from assistive tech — brand names are already spelled out in the hero copy, and a duplicated logo strip would otherwise announce each one twice", () => {
    useReducedMotion.mockReturnValue(false);

    const { container } = render(<BrandMarquee brands={brands} />);

    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});
