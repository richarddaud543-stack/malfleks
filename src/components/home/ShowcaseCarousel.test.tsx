import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import ShowcaseCarousel from "./ShowcaseCarousel";
import { getFeatured } from "./featured";
import { brands, products } from "@/data";

// The same picking logic the component itself uses, so "slide N shows
// product N" assertions below don't hardcode a second, potentially-drifting
// copy of "which product represents which brand".
const featured = getFeatured(brands, products);

/** The slide's `<h3>` holds only the product name — no sibling text nodes
 *  to worry about, unlike the brand/category line above it. */
function activeProductHeading() {
  return within(screen.getByRole("group")).getByRole("heading", { level: 3 });
}

const { useReducedMotion } = vi.hoisted(() => ({
  useReducedMotion: vi.fn<() => boolean>(),
}));

// Only `useReducedMotion` needs real test-controlled behavior. `motion.div`
// is stubbed down to a plain `<div>` (resolving any MotionValue-shaped style
// values via `.get()` first, since a real DOM style object can't hold one),
// `AnimatePresence` just renders its children with no exit/enter choreography
// (this suite is about the carousel's *logic* — autoplay, pause, manual nav,
// the reduced-motion branch — not about verifying a fade/slide tween runs,
// which jsdom has no paint loop to check against anyway), and
// `useMotionValue`/`useTransform` are lightweight `{ get, set }` stand-ins
// sufficient for the tilt handlers ShowcaseCard wires up without crashing.
vi.mock("motion/react", () => {
  function makeMotionValue(initial: number) {
    let value = initial;
    return { get: () => value, set: (v: number) => { value = v; } };
  }

  // Motion-only props: not valid DOM attributes, dropped rather than
  // forwarded to the real `<div>` this stubs out.
  const MOTION_ONLY_PROPS = ["initial", "animate", "exit", "transition"];

  const motionDiv = React.forwardRef<HTMLDivElement, Record<string, unknown>>(
    function MotionDiv(props, ref) {
      const { children, style, ...rest } = props;
      for (const key of MOTION_ONLY_PROPS) delete rest[key];
      const resolvedStyle = style
        ? Object.fromEntries(
            Object.entries(style as Record<string, unknown>).map(([k, v]) => [
              k,
              v && typeof (v as { get?: unknown }).get === "function"
                ? (v as { get: () => unknown }).get()
                : v,
            ])
          )
        : undefined;
      return React.createElement(
        "div",
        { ref, style: resolvedStyle, ...rest },
        children as React.ReactNode
      );
    }
  );

  return {
    useReducedMotion,
    motion: { div: motionDiv },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useMotionValue: (v: number) => makeMotionValue(v),
    useTransform: () => makeMotionValue(0),
  };
});

describe("ShowcaseCarousel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("reduced motion", () => {
    beforeEach(() => useReducedMotion.mockReturnValue(true));

    it("renders every brand's featured product at once, with no carousel chrome", () => {
      render(<ShowcaseCarousel items={featured} />);

      for (const brand of brands) {
        expect(screen.getByText(brand.name)).toBeInTheDocument();
      }
      expect(screen.queryByRole("region")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /pause automatic rotation/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("motion allowed", () => {
    beforeEach(() => {
      useReducedMotion.mockReturnValue(false);
      vi.useFakeTimers();
    });

    it("auto-advances to the next brand's product after the interval, and stops advancing once paused", () => {
      render(<ShowcaseCarousel items={featured} />);

      expect(activeProductHeading()).toHaveTextContent(featured[0].product.name);

      act(() => { vi.advanceTimersByTime(4500); });
      expect(activeProductHeading()).toHaveTextContent(featured[1].product.name);

      fireEvent.click(
        screen.getByRole("button", { name: /pause automatic rotation/i })
      );
      act(() => { vi.advanceTimersByTime(20000); });
      // Paused: still on slide 1, not still cycling.
      expect(activeProductHeading()).toHaveTextContent(featured[1].product.name);
    });

    it("pauses on hover and resumes once the pointer leaves", () => {
      const { container } = render(<ShowcaseCarousel items={featured} />);
      const root = container.firstChild as HTMLElement;

      fireEvent.mouseEnter(root);
      act(() => { vi.advanceTimersByTime(10000); });
      expect(activeProductHeading()).toHaveTextContent(featured[0].product.name);

      fireEvent.mouseLeave(root);
      act(() => { vi.advanceTimersByTime(4500); });
      expect(activeProductHeading()).toHaveTextContent(featured[1].product.name);
    });

    it("lets a manual click jump to a specific product via the dot controls", () => {
      render(<ShowcaseCarousel items={featured} />);

      fireEvent.click(
        screen.getByRole("button", {
          name: new RegExp(`show .* from ${brands[2].name}`, "i"),
        })
      );

      expect(activeProductHeading()).toHaveTextContent(featured[2].product.name);
    });

    it("wraps from the last product back to the first via the next control", () => {
      render(<ShowcaseCarousel items={featured} />);

      const next = screen.getByRole("button", { name: /next featured product/i });
      for (let i = 0; i < brands.length; i++) {
        fireEvent.click(next);
      }

      expect(activeProductHeading()).toHaveTextContent(featured[0].product.name);
    });
  });
});
