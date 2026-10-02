import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import ProductPhoto from "./ProductPhoto";

const SUPABASE = "https://project.supabase.co";
const PHOTO = `${SUPABASE}/storage/v1/object/public/product-photos/uid-1/a.webp`;

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("ProductPhoto", () => {
  it("draws the fallback when there is no photo", () => {
    render(<ProductPhoto src={undefined} alt="Tecno Spark 20" fallback={<span>icon tile</span>} />);

    expect(screen.getByText("icon tile")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("treats an empty or blank URL as no photo", () => {
    render(<ProductPhoto src="   " alt="Tecno Spark 20" fallback={<span>icon tile</span>} />);
    expect(screen.getByText("icon tile")).toBeInTheDocument();
  });

  it("uses the product name as alt text, in a square frame that does not crop", () => {
    const { container } = render(<ProductPhoto src={PHOTO} alt="Tecno Spark 20" sizes="96px" />);

    const img = screen.getByAltText("Tecno Spark 20");
    expect(img.className).toContain("object-contain");
    expect(img.className).not.toContain("object-cover");
    expect(container.firstElementChild?.className).toContain("aspect-square");
  });

  it("lazy-loads by default and loads eagerly, at high priority, when asked", () => {
    const { unmount } = render(<ProductPhoto src={PHOTO} alt="lazy" />);
    expect(screen.getByAltText("lazy")).toHaveAttribute("loading", "lazy");
    unmount();

    render(<ProductPhoto src={PHOTO} alt="eager" eager />);
    const eager = screen.getByAltText("eager");
    expect(eager).toHaveAttribute("loading", "eager");
    expect(eager.getAttribute("fetchpriority")).toBe("high");
  });

  it("falls back to the plain file when the Supabase URL is not configured, instead of crashing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    render(<ProductPhoto src={PHOTO} alt="Tecno Spark 20" sizes="96px" />);

    // Unoptimised: the src is the photo itself, not an /_next/image URL.
    expect(screen.getByAltText("Tecno Spark 20")).toHaveAttribute("src", PHOTO);
  });

  it("goes through the optimiser for a photo in our own bucket", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);

    render(<ProductPhoto src={PHOTO} alt="Tecno Spark 20" sizes="96px" />);

    const src = screen.getByAltText("Tecno Spark 20").getAttribute("src") ?? "";
    expect(src).toContain("/_next/image");
    expect(decodeURIComponent(src)).toContain(PHOTO);
  });

  it("never sends a URL from anywhere else to the optimiser", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);

    render(<ProductPhoto src="https://elsewhere.example/a.jpg" alt="Other" sizes="96px" />);

    expect(screen.getByAltText("Other")).toHaveAttribute("src", "https://elsewhere.example/a.jpg");
  });

  it("shows the file as uploaded when `original` is set, even for our own bucket", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);

    render(<ProductPhoto src={PHOTO} alt="Tecno Spark 20" original />);

    expect(screen.getByAltText("Tecno Spark 20")).toHaveAttribute("src", PHOTO);
  });

  it("swaps to the fallback if the photo fails to load", () => {
    render(<ProductPhoto src={PHOTO} alt="Tecno Spark 20" fallback={<span>icon tile</span>} />);

    fireEvent.error(screen.getByAltText("Tecno Spark 20"));

    expect(screen.getByText("icon tile")).toBeInTheDocument();
    expect(screen.queryByAltText("Tecno Spark 20")).toBeNull();
  });

  it("renders a fixed-size square when given a size", () => {
    const { container } = render(<ProductPhoto src={PHOTO} alt="Tecno Spark 20" size={56} />);

    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.width).toBe("56px");
    expect(frame.style.height).toBe("56px");
    expect(screen.getByAltText("Tecno Spark 20")).toHaveAttribute("width", "56");
  });
});
