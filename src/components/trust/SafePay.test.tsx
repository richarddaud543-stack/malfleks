import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PROMISE } from "@/lib/promise";
import SafePay from "./SafePay";

describe("SafePay", () => {
  it("states the promise, in English and Swahili, and links to the terms", () => {
    render(<SafePay />);

    expect(screen.getByRole("heading", { name: PROMISE.headline })).toBeInTheDocument();

    const swahili = screen.getByText(PROMISE.swahili);
    expect(swahili).toHaveAttribute("lang", "sw");

    for (const point of PROMISE.points) {
      expect(screen.getByText(`${point.title}.`)).toBeInTheDocument();
    }

    expect(screen.getByRole("link", { name: PROMISE.link.label })).toHaveAttribute("href", "/terms#paying");
  });

  it("keeps the headline and the link when compact, and drops the points", () => {
    render(<SafePay compact />);

    expect(screen.getByRole("heading", { name: PROMISE.headline })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: PROMISE.link.label })).toBeInTheDocument();
    expect(screen.queryByText(`${PROMISE.points[0].title}.`)).not.toBeInTheDocument();
  });

  it("promises nothing the terms do not: no refund timing, no change-of-mind refund", () => {
    const words = [PROMISE.headline, ...PROMISE.points.flatMap((p) => [p.title, p.body])].join(" ").toLowerCase();

    expect(words).not.toMatch(/\b(hours?|days?|instant|immediately|guarantee)\b/);
    expect(words).not.toMatch(/change your mind|any reason/);
  });
});
