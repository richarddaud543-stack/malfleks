import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import Breadcrumbs from "./Breadcrumbs";

const trail = [
  { label: "Brands", href: "/brands" },
  { label: "Toyota", href: "/brands/toyota" },
  { label: "Corolla </script>" },
];

describe("Breadcrumbs", () => {
  it("links every level above the page and marks the page itself as current", () => {
    render(<Breadcrumbs trail={trail} />);

    expect(screen.getByRole("link", { name: "Brands" })).toHaveAttribute("href", "/brands");
    expect(screen.getByRole("link", { name: "Toyota" })).toHaveAttribute("href", "/brands/toyota");
    expect(screen.queryByRole("link", { name: /Corolla/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Corolla/)).toHaveAttribute("aria-current", "page");
  });

  it("publishes the trail as structured data only when it knows the site address, and escapes it", () => {
    const { container, rerender } = render(<Breadcrumbs trail={trail} />);
    expect(container.querySelector("script")).toBeNull();

    rerender(<Breadcrumbs trail={trail} siteUrl="https://malfleks.example" />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    expect(script?.innerHTML).not.toContain("</script>");
    const data = JSON.parse(script?.innerHTML ?? "{}");
    expect(data.itemListElement).toHaveLength(3);
    expect(data.itemListElement[1].item).toBe("https://malfleks.example/brands/toyota");
  });
});
