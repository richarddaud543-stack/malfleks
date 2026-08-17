import { test, expect } from "@playwright/test";

// A first-time visitor, unlike every other spec — playwright.config.ts gives
// the rest of the suite a pre-answered banner so it stays out of their way.
test.use({ storageState: { cookies: [], origins: [] } });

const CONSENT_KEY = "soko:analytics-consent:v1";

const storedDecision = (page: import("@playwright/test").Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), CONSENT_KEY);

/** Requests to Google's analytics endpoints, which must not happen unasked. */
function trackAnalyticsRequests(page: import("@playwright/test").Page): string[] {
  const hits: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/google-analytics\.com|googletagmanager\.com|analytics\.google\.com/.test(url)) {
      hits.push(url);
    }
  });
  return hits;
}

test.describe("analytics consent", () => {
  test("a first visit asks, and sends nothing before it is answered", async ({
    page,
  }) => {
    const hits = trackAnalyticsRequests(page);
    await page.goto("/");

    await expect(page.getByTestId("consent-banner")).toBeVisible();
    expect(await storedDecision(page)).toBeNull();
    // The point of the whole feature: undecided is not consent.
    expect(hits).toEqual([]);
  });

  test("declining is one click and keeps analytics off across pages", async ({
    page,
  }) => {
    const hits = trackAnalyticsRequests(page);
    await page.goto("/");

    await page.getByRole("button", { name: "No thanks" }).click();

    await expect(page.getByTestId("consent-banner")).toHaveCount(0);
    expect(await storedDecision(page)).toBe("denied");

    // The decision survives a navigation rather than being re-asked, and the
    // second page loads just as silently.
    await page.goto("/search");
    await expect(page.getByTestId("consent-banner")).toHaveCount(0);
    expect(hits).toEqual([]);
  });

  test("the choice is reachable from the keyboard without crossing the page", async ({
    page,
  }) => {
    await page.goto("/");

    // Skip link first, then the banner's own buttons — DOM order is tab order,
    // and a choice reached only after every link on the page is not a choice.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Allow" })).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "No thanks" })).toBeFocused();

    // And it is operable from there, not just focusable.
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("consent-banner")).toHaveCount(0);
    expect(await storedDecision(page)).toBe("denied");
  });

  test("the footer reports the choice and can take it back", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Allow" }).click();
    await expect(page.getByTestId("consent-banner")).toHaveCount(0);

    const preferences = page.getByTestId("consent-preferences");
    await expect(preferences).toContainText("Analytics: allowed");

    await preferences.click();

    await expect(page.getByTestId("consent-banner")).toBeVisible();
    expect(await storedDecision(page)).toBeNull();
  });

  test("the banner does not block the page for someone who ignores it", async ({
    page,
  }) => {
    await page.goto("/search");

    // No focus trap and no scroll lock: the site has to keep working for a
    // visitor who simply never answers.
    await expect(page.getByTestId("consent-banner")).toBeVisible();
    await page.getByRole("searchbox").fill("hilux");
    await expect(page.getByTestId("search-result").first()).toBeVisible();
    await expect(page.getByTestId("consent-banner")).toBeVisible();
  });
});
