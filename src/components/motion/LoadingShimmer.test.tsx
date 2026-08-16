import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import LoadingShimmer from "./LoadingShimmer";

const { useReducedMotion } = vi.hoisted(() => ({
  useReducedMotion: vi.fn<() => boolean>(),
}));

vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>(
    "motion/react"
  );
  return { ...actual, useReducedMotion };
});

// The shimmer band is the whole point of this component, so the test that
// actually matters is that reduced motion drops it rather than merely
// pausing it — a looping `animate` prop with `repeat: Infinity` doesn't stop
// on its own just because the user asked for less motion.
describe("LoadingShimmer", () => {
  it("renders no shimmer band when motion is reduced — a static block only", () => {
    useReducedMotion.mockReturnValue(true);

    const { container } = render(<LoadingShimmer className="h-10 w-64" />);
    const block = container.firstChild as HTMLElement;

    expect(block.className).toContain("bg-surface");
    expect(block.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("renders a decorative shimmer band when motion is not reduced", () => {
    useReducedMotion.mockReturnValue(false);

    const { container } = render(<LoadingShimmer className="h-10 w-64" />);
    const band = container.querySelector('[aria-hidden="true"]');

    expect(band).not.toBeNull();
  });
});
