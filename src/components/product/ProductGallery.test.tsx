import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import ProductGallery from "./ProductGallery";

/**
 * The product page's photos.
 *
 * What is pinned down here is what a buyer on a phone relies on: every photo
 * is reachable from a thumbnail, the full-screen view opens from the main
 * image, and it can be left three ways — the close button, Escape, and the
 * browser's Back button — without Back taking them off the product page.
 */

const PHOTOS = [
  "https://p.supabase.co/storage/v1/object/public/product-photos/u/front.webp",
  "https://p.supabase.co/storage/v1/object/public/product-photos/u/back.webp",
  "https://p.supabase.co/storage/v1/object/public/product-photos/u/scratch.webp",
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The src of the large image, wherever next/image put it. */
function mainSrc(): string {
  const img = screen.getByTestId("gallery-main").querySelector("img");
  return decodeURIComponent(img?.getAttribute("src") ?? "");
}

async function openLightbox() {
  fireEvent.click(screen.getByTestId("gallery-main"));
  return screen.findByRole("dialog");
}

describe("ProductGallery", () => {
  it("shows the main photo with the product's name as its alt text and a visible zoom hint", () => {
    render(<ProductGallery photos={PHOTOS} name="Tecno Spark 20" />);

    expect(mainSrc()).toContain("front.webp");
    expect(screen.getByAltText("Tecno Spark 20 — photo 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Tap to zoom")).toBeVisible();
  });

  it("shows no thumbnail strip for a single photo", () => {
    render(<ProductGallery photos={PHOTOS.slice(0, 1)} name="Tecno Spark 20" />);

    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByAltText("Tecno Spark 20")).toBeInTheDocument();
  });

  it("offers a thumbnail per photo, and tapping one swaps the main image", () => {
    render(<ProductGallery photos={PHOTOS} name="Tecno Spark 20" />);

    const strip = screen.getByRole("list", { name: "Photos of Tecno Spark 20" });
    const thumbs = within(strip).getAllByRole("button");
    expect(thumbs).toHaveLength(3);
    // Thumbnails are real images, not dots.
    for (const thumb of thumbs) expect(thumb.querySelector("img")).not.toBeNull();
    expect(thumbs[0]).toHaveAttribute("aria-current", "true");

    fireEvent.click(screen.getByRole("button", { name: "Show photo 3 of 3" }));

    expect(mainSrc()).toContain("scratch.webp");
    expect(screen.getByRole("button", { name: "Show photo 3 of 3" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(thumbs[0]).not.toHaveAttribute("aria-current");
  });

  it("opens a full-screen dialog showing the file as uploaded, and moves focus into it", async () => {
    render(<ProductGallery photos={PHOTOS} name="Tecno Spark 20" />);
    fireEvent.click(screen.getByRole("button", { name: "Show photo 2 of 3" }));

    const dialog = await openLightbox();

    expect(dialog).toHaveAttribute("aria-modal", "true");
    // The original URL, not an optimiser URL — zooming must show real detail.
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", PHOTOS[1]);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("closes with the close button and hands focus back to the main image", async () => {
    render(<ProductGallery photos={PHOTOS} name="Tecno Spark 20" />);
    await openLightbox();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("gallery-main")).toHaveFocus();
  });

  it("closes with Escape", async () => {
    render(<ProductGallery photos={PHOTOS} name="Tecno Spark 20" />);
    await openLightbox();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes with the browser's Back button, without leaving the page", async () => {
    render(<ProductGallery photos={PHOTOS} name="Tecno Spark 20" />);
    const pushState = vi.spyOn(window.history, "pushState");
    const href = window.location.href;

    await openLightbox();
    // Opening took exactly one history entry, on the same URL.
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe(href);

    act(() => {
      window.history.back();
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.href).toBe(href);
    // The gallery itself is still there: Back closed the view, not the page.
    expect(screen.getByTestId("gallery-main")).toBeInTheDocument();
  });

  it("keeps Tab inside the dialog in both directions", async () => {
    render(<ProductGallery photos={PHOTOS} name="Tecno Spark 20" />);
    await openLightbox();

    const close = screen.getByRole("button", { name: "Close" });
    const next = screen.getByRole("button", { name: "Next photo" });

    // From the last control, Tab wraps to the first…
    next.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    // …and from the first, Shift+Tab wraps to the last.
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(next).toHaveFocus();
  });

  it("pulls focus back in if it has somehow ended up behind the dialog", async () => {
    render(<ProductGallery photos={PHOTOS} name="Tecno Spark 20" />);
    await openLightbox();

    screen.getByRole("button", { name: "Show photo 1 of 3" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });

    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("steps through the photos inside the dialog with the buttons and the arrow keys", async () => {
    render(<ProductGallery photos={PHOTOS} name="Tecno Spark 20" />);
    const dialog = await openLightbox();

    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", PHOTOS[1]);

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", PHOTOS[2]);

    // Wraps round rather than stopping dead at the end.
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", PHOTOS[0]);

    fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", PHOTOS[2]);
  });

  it("has no previous/next controls when there is only one photo", async () => {
    render(<ProductGallery photos={PHOTOS.slice(0, 1)} name="Tecno Spark 20" />);
    await openLightbox();

    expect(screen.queryByRole("button", { name: "Next photo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("stops the page behind from scrolling while open, and restores it after", async () => {
    render(<ProductGallery photos={PHOTOS} name="Tecno Spark 20" />);
    await openLightbox();
    expect(document.documentElement.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("renders nothing at all without photos", () => {
    const { container } = render(<ProductGallery photos={[]} name="Tecno Spark 20" />);
    expect(container).toBeEmptyDOMElement();
  });
});
