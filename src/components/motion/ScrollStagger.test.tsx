import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import ScrollStagger from "./ScrollStagger";

const { useReducedMotion, gsapSet, gsapTo } = vi.hoisted(() => ({
  useReducedMotion: vi.fn<() => boolean>(),
  gsapSet: vi.fn(),
  gsapTo: vi.fn(),
}));

vi.mock("motion/react", () => ({ useReducedMotion }));

// useGSAP normally runs its callback in a layout effect, *after* the ref it
// closes over has been attached to the real DOM node. Running the callback
// synchronously at call time (i.e. during render) instead would see
// `scope.current` still `null` — refs aren't attached until commit — so
// ScrollStagger's own `!scope.current` guard would always bail. A real
// `useEffect` reproduces the "runs after mount, ref is attached" ordering
// that matters here without needing the real `@gsap/react` package.
vi.mock("@gsap/react", () => ({
  useGSAP: (cb: () => void, config?: { dependencies?: unknown[] }) => {
    // Deliberately mirrors the real hook's signature: the dependency array is
    // whatever the caller passes through `config.dependencies`, not a literal
    // this mock can spell out itself.
    /* eslint-disable react-hooks/exhaustive-deps */
    useEffect(() => {
      cb();
    }, config?.dependencies ?? []);
    /* eslint-enable react-hooks/exhaustive-deps */
  },
}));

vi.mock("gsap", () => ({
  default: { registerPlugin: vi.fn(), set: gsapSet, to: gsapTo },
}));
vi.mock("gsap/ScrollTrigger", () => ({ ScrollTrigger: {} }));

describe("ScrollStagger", () => {
  beforeEach(() => {
    gsapSet.mockClear();
    gsapTo.mockClear();
  });

  it("registers a single staggered ScrollTrigger tween over every [data-reveal] descendant, in document order, when motion is allowed", () => {
    useReducedMotion.mockReturnValue(false);

    const { container } = render(
      <ScrollStagger>
        <div data-reveal>first</div>
        <div className="not-a-target">
          <div data-reveal>second</div>
          <div data-reveal>third</div>
        </div>
      </ScrollStagger>
    );

    expect(gsapSet).toHaveBeenCalledTimes(1);
    const [setTargets] = gsapSet.mock.calls[0];
    expect(Array.from(setTargets as NodeListOf<HTMLElement>).map((el) => el.textContent)).toEqual([
      "first",
      "second",
      "third",
    ]);

    expect(gsapTo).toHaveBeenCalledTimes(1);
    const [toTargets, vars] = gsapTo.mock.calls[0];
    expect(Array.from(toTargets as NodeListOf<HTMLElement>).map((el) => el.textContent)).toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(vars).toMatchObject({ opacity: 1, y: 0, stagger: 0.12 });
    expect(vars.scrollTrigger).toMatchObject({
      trigger: container.firstChild,
      once: true,
    });
  });

  it("does nothing — no gsap calls at all — when motion is reduced", () => {
    useReducedMotion.mockReturnValue(true);

    render(
      <ScrollStagger>
        <div data-reveal>first</div>
      </ScrollStagger>
    );

    expect(gsapSet).not.toHaveBeenCalled();
    expect(gsapTo).not.toHaveBeenCalled();
  });

  it("is a no-op when there are no [data-reveal] descendants, rather than animating nothing", () => {
    useReducedMotion.mockReturnValue(false);

    render(
      <ScrollStagger>
        <div>plain content, nothing marked</div>
      </ScrollStagger>
    );

    expect(gsapSet).not.toHaveBeenCalled();
    expect(gsapTo).not.toHaveBeenCalled();
  });
});
