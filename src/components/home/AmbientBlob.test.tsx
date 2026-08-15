import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import AmbientBlob from "./AmbientBlob";

const { useReducedMotion } = vi.hoisted(() => ({
  useReducedMotion: vi.fn<() => boolean>(),
}));

vi.mock("motion/react", () => ({ useReducedMotion }));

// globals.css's `.blob { animation: blob-drift 18s ... }` has no
// `prefers-reduced-motion` guard — it's out of this round's scope to edit —
// so AmbientBlob is the one place that gate has to live instead. This test
// is the thing that would actually catch a regression there: it would still
// pass if the gate were silently dropped from the component and the div
// just always rendered the `.blob` class, unless it asserts the inline
// override is present specifically when motion is reduced.
describe("AmbientBlob", () => {
  it("kills the animation with an inline override when motion is reduced", () => {
    useReducedMotion.mockReturnValue(true);

    const { container } = render(
      <AmbientBlob className="h-10 w-10 bg-accent" />
    );
    const blob = container.firstChild as HTMLElement;

    expect(blob.className).toContain("blob");
    expect(blob.style.animation).toBe("none");
  });

  it("leaves the CSS animation running when motion is not reduced", () => {
    useReducedMotion.mockReturnValue(false);

    const { container } = render(
      <AmbientBlob className="h-10 w-10 bg-accent" />
    );
    const blob = container.firstChild as HTMLElement;

    expect(blob.className).toContain("blob");
    expect(blob.style.animation).toBe("");
  });

  it("preserves caller-supplied style (e.g. animationDelay) alongside the reduced-motion override", () => {
    useReducedMotion.mockReturnValue(true);

    const { container } = render(
      <AmbientBlob
        className="h-10 w-10 bg-accent"
        style={{ animationDelay: "-6s" }}
      />
    );
    const blob = container.firstChild as HTMLElement;

    expect(blob.style.animation).toBe("none");
    expect(blob.style.animationDelay).toBe("-6s");
  });

  it("is hidden from assistive tech — it's decorative", () => {
    useReducedMotion.mockReturnValue(false);

    const { container } = render(
      <AmbientBlob className="h-10 w-10 bg-accent" />
    );
    const blob = container.firstChild as HTMLElement;

    expect(blob.getAttribute("aria-hidden")).toBe("true");
  });
});
