import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ProductIcon from "./ProductIcon";
import { PRODUCT_ICON_KEYS } from "@/lib/product-icons";

describe("ProductIcon", () => {
  // Every key `product-icons.ts` lists must actually have a hand-drawn entry
  // in this component's `icons` map — that pairing is normally enforced by
  // TypeScript (`Record<ProductIconKey, ...>`), but this catches the one
  // thing the type system can't: an entry present but empty (no <path>s), so
  // a real key silently renders a blank square instead of a picture.
  it.each(PRODUCT_ICON_KEYS)("renders %s with at least one path", (key) => {
    const { container } = render(<ProductIcon icon={key} />);
    expect(container.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("renders a known icon key without crashing", () => {
    const { container } = render(<ProductIcon icon="sedan" />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("path")).toBeTruthy();
  });

  // The fallback used to be the smartphone. That was a guess that happened
  // to be right while the catalogue was electronics, and a phone drawn on a
  // sofa once it was not — an unknown key now gets the neutral package.
  it("falls back to the neutral package for an unrecognized key, not a smartphone", () => {
    const pkg = render(<ProductIcon icon="package" />);
    const phone = render(<ProductIcon icon="smartphone" />);
    const unknown = render(<ProductIcon icon="totally-not-a-real-product-category" />);

    const pkgPath = pkg.container.querySelector("path")?.getAttribute("d");
    const phonePath = phone.container.querySelector("path")?.getAttribute("d");
    const unknownPath = unknown.container.querySelector("path")?.getAttribute("d");

    expect(unknownPath).toBe(pkgPath);
    expect(unknownPath).not.toBe(phonePath);
  });

  it("does not mistake an inherited object property for an icon key", () => {
    // `"toString" in icons` is true; looking it up would crash the render.
    const { container } = render(<ProductIcon icon="toString" />);
    expect(container.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("draws each of the everyday-category icons differently from the package", () => {
    const pkgPath = render(<ProductIcon icon="package" />)
      .container.querySelector("path")
      ?.getAttribute("d");
    for (const key of ["tshirt", "shoe", "bottle", "sofa", "basket", "wrench"]) {
      const d = render(<ProductIcon icon={key} />)
        .container.querySelector("path")
        ?.getAttribute("d");
      expect(d, key).toBeTruthy();
      expect(d, key).not.toBe(pkgPath);
    }
  });

  it("applies the passed className and style to the svg element", () => {
    const { container } = render(
      <ProductIcon icon="laptop" className="h-4 w-4" style={{ color: "#ff0000" }} />
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("h-4");
    expect(svg?.getAttribute("style")).toContain("color");
  });
});
