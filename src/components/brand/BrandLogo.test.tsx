import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import BrandLogo, { initials } from "./BrandLogo";

/**
 * The case this component exists for: a brand with no logo file.
 *
 * Every brand in the seeded catalogue had an SVG in `/public`, so four call
 * sites rendered `<Image src={brand.logo} />` and none considered the empty
 * string. A brand created by an admin from a partner application has no logo —
 * there is no storage bucket to upload one to — and `next/image` throws on an
 * empty `src` rather than degrading. That would have taken down the home page,
 * `/brands`, the brand page and the locator the first time a real partner went
 * live.
 */

const withLogo = {
  name: "Toyota",
  logo: "/images/brands/toyota.svg",
  accentColor: "#eb0a1e",
};

const withoutLogo = {
  name: "Kariakoo Electronics",
  logo: "",
  accentColor: "#1f6f5c",
};

describe("BrandLogo", () => {
  it("renders the image when there is one", () => {
    render(<BrandLogo brand={withLogo} sizes="64px" />);

    expect(screen.getByRole("img", { name: "Toyota" })).toBeInTheDocument();
  });

  it("renders initials instead of a broken image when there is none", () => {
    const { container } = render(<BrandLogo brand={withoutLogo} sizes="64px" />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("KE");
  });

  it("never emits an image with an empty src", () => {
    const { container } = render(<BrandLogo brand={withoutLogo} sizes="64px" />);

    // The specific crash: next/image throws on src="". Catching it here rather
    // than in a page that renders four of them.
    expect(container.innerHTML).not.toMatch(/src=""/);
  });

  it("treats a whitespace-only logo as absent", () => {
    const { container } = render(
      <BrandLogo brand={{ ...withoutLogo, logo: "   " }} sizes="64px" />,
    );

    expect(container.querySelector("img")).toBeNull();
  });

  it("paints the monogram in the brand's own accent colour", () => {
    const { container } = render(<BrandLogo brand={withoutLogo} sizes="64px" />);

    expect(container.querySelector("span")).toHaveStyle({
      background: "#1f6f5c",
    });
  });
});

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Kariakoo Electronics")).toBe("KE");
    expect(initials("Dar Auto Centre Limited")).toBe("DA");
  });

  it("takes two letters from a single word", () => {
    expect(initials("Halotel")).toBe("HA");
    expect(initials("Q")).toBe("Q");
  });

  it("ignores punctuation-only words rather than rendering a bracket", () => {
    expect(initials("MalFleks & Co")).toBe("MC");
  });

  it("has something to draw even for a name of nothing", () => {
    expect(initials("   ")).toBe("?");
    expect(initials("!!!")).toBe("?");
  });
});
