import { test, expect } from "@playwright/test";

// React's `<ViewTransition name>` only applies the browser's native
// `view-transition-name` to a DOM node for the brief window a transition is
// actually running — it is not a persistent style, so it can't be asserted
// on an idle page. (React does embed a static `vt-name` attribute in
// server-rendered HTML for a named instance, but that's a pre-hydration
// marker only — it's stripped once the client tree hydrates, so it isn't
// observable in a live, post-hydration page either.)
//
// So the two ends are checked two different ways:
//
// - The outgoing card: hook `document.startViewTransition` via
//   `addInitScript` (in place however early React feature-detects the
//   browser API) and read `view-transition-name` off the card's tile at the
//   exact moment a transition is requested — the "old snapshot" instant,
//   proving the browser API is actually invoked with the right identity.
// - The destination page: request its own server-rendered HTML directly and
//   assert it embeds a `<ViewTransition>` with the matching `name` (React's
//   `vt-name` attribute, present in SSR output regardless of what the client
//   does with it afterward). Checking the server response directly
//   sidesteps racing the live transition's mount/clear timing, and racing
//   Next's own prefetch — which fires more than one request per route and
//   isn't reliably the one carrying the full component tree — both of which
//   proved flaky to catch from the outside.
//
// Together these assert what the brief calls achievable: the same
// transition name is present on both ends. They do not assert the morph
// animation itself renders correctly (unfalsifiable in a headless run).
test.describe("view transitions", () => {
  test("a search result and its product page share a view transition name", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      type VtState = { calls: number; oldName: string | null };
      (window as unknown as { __vt: VtState }).__vt = {
        calls: 0,
        oldName: null,
      };
      if (typeof document.startViewTransition !== "function") return;
      const real = document.startViewTransition.bind(document);
      Object.defineProperty(document, "startViewTransition", {
        configurable: true,
        writable: true,
        value: (arg: Parameters<typeof document.startViewTransition>[0]) => {
          const state = (window as unknown as { __vt: VtState }).__vt;
          state.calls++;
          const tile = document.querySelector(
            'a[href="/products/toyota-hilux"] div'
          );
          state.oldName = tile
            ? getComputedStyle(tile).viewTransitionName
            : null;
          return real(arg);
        },
      });
    });

    // The destination's own server-rendered HTML embeds the matching
    // identity independent of the click below or of any prefetch timing.
    const destinationHtml = await (
      await page.request.get("/products/toyota-hilux")
    ).text();
    expect(destinationHtml).toContain('vt-name="product-toyota-hilux"');

    await page.goto("/search?q=hilux");
    const result = page.getByTestId("search-result").first();
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute("href", "/products/toyota-hilux");

    // The morph only forms a pair when the destination has already rendered
    // in the same commit as the navigation — the documented behaviour for a
    // prefetched (cached) page. Next's Link prefetches automatically once
    // visible, but a fixed wait races that network call, especially under
    // `next dev` (which compiles routes on first request); waiting for
    // network idle is the deterministic version of the same wait.
    await page.waitForLoadState("networkidle");

    await result.click();
    await expect(page).toHaveURL(/\/products\/toyota-hilux$/);
    await expect(
      page.getByRole("heading", { name: "Toyota Hilux" })
    ).toBeVisible();

    const vt = await page.evaluate(
      () => (window as unknown as { __vt: { calls: number; oldName: string | null } }).__vt
    );
    expect(vt.calls).toBeGreaterThan(0);
    expect(vt.oldName).toBe("product-toyota-hilux");
  });

  test("a same-page filter change does not trigger a view transition", async ({
    page,
  }) => {
    // ListingCard already has its own `motion.div layout` animation for
    // reordering on /search. A named `<ViewTransition>` left unscoped would
    // also activate on this same-page, `startTransition`-wrapped filter
    // update (SearchExplorer's `commit`) and fight it. This is the
    // regression that the `transitionTypes`/`update="none"` scoping in
    // ListingCard.tsx exists to prevent.
    await page.addInitScript(() => {
      (window as unknown as { __vt: { calls: number } }).__vt = { calls: 0 };
      if (typeof document.startViewTransition !== "function") return;
      const real = document.startViewTransition.bind(document);
      Object.defineProperty(document, "startViewTransition", {
        configurable: true,
        writable: true,
        value: (arg: Parameters<typeof document.startViewTransition>[0]) => {
          (window as unknown as { __vt: { calls: number } }).__vt.calls++;
          return real(arg);
        },
      });
    });

    await page.goto("/search");
    await expect(page.getByTestId("search-result").first()).toBeVisible();

    await page.getByRole("button", { name: /^BMW\s*\d+$/ }).click();
    await expect(page).toHaveURL(/brand=bmw/);

    const vt = await page.evaluate(
      () => (window as unknown as { __vt: { calls: number } }).__vt
    );
    expect(vt.calls).toBe(0);
  });
});
