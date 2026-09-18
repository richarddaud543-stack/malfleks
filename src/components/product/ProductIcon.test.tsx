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

  it("falls back to the smartphone icon for an unrecognized key instead of crashing", () => {
    const known = render(<ProductIcon icon="smartphone" />);
    const unknown = render(<ProductIcon icon="totally-not-a-real-product-category" />);

    const knownPath = known.container.querySelector("path")?.getAttribute("d");
    const unknownPath = unknown.container.querySelector("path")?.getAttribute("d");

    expect(unknownPath).toBe(knownPath);
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
