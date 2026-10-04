import { test, expect, type Page } from "@playwright/test";

// One switch puts the whole site in Swahili or in English (4 Oct 2026). A
// visitor who has not chosen gets Swahili. Every other spec starts having
// chosen English (see `playwright.config.ts`); these start with no choice.

const noChoice = { cookies: [], origins: [] };

const toggle = (page: Page, name: "Kiswahili" | "English") =>
  page.locator("header").getByTestId("language-toggle").first().getByRole("button", { name });

test.describe("a visitor who has not chosen a language", () => {
  test.use({ storageState: noChoice });

  test("gets the site in Swahili, at the plain address", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("MalFleks — Pesa yako inalindwa mpaka mzigo ufike");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Pesa yako inalindwa mpaka mzigo\s+ufike/);
    await expect(page.locator("html")).toHaveAttribute("lang", "sw");
    await expect(page.locator("header").getByRole("link", { name: "Chapa", exact: true })).toBeVisible();
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Masharti ya matumizi" })).toBeVisible();

    // What search engines are told: this is the Swahili page, and where the English one is.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "http://localhost:3000/sw");
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", "http://localhost:3000/en");
    await expect(page.locator('link[rel="alternate"][hreflang="sw"]')).toHaveAttribute("href", "http://localhost:3000/sw");
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "sw_TZ");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);
  });

  test("can shop from search to the order form without meeting English", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tafuta kwenye soko zima");
    await expect(page.getByPlaceholder("Tafuta bidhaa, chapa au mji…")).toBeVisible();

    await page.goto("/products/toyota-corolla");
    await expect(page.getByTestId("stock-label")).toHaveText("Ipo");
    await page.getByRole("link", { name: "Agiza na uchague usafirishaji" }).click();

    await expect(page).toHaveURL(/\/delivery\/toyota-corolla$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Usafirishaji wa oda yako");
    await expect(page.getByLabel("Jina kamili")).toBeVisible();
    await expect(page.getByLabel("Mji wa kuletewa")).toBeVisible();

    // The rules speak Swahili too.
    await page.getByRole("button", { name: "Ingia ili uagize" }).click();
    await expect(page.getByText("Andika jina ambalo dereva ataliulizia.")).toBeVisible();
    await expect(page.getByText("Taja mzigo huu unakwenda mji gani.")).toBeVisible();
  });

  test("an address that is not a page is answered in Swahili, inside the site's frame", async ({ page }) => {
    const response = await page.goto("/hakuna-ukurasa-huu");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hatukuupata ukurasa huo");
    await expect(page.locator("header").getByRole("link", { name: "Tafuta" }).first()).toBeVisible();
  });
});

test.describe("the language switch", () => {
  test.use({ storageState: noChoice });

  test("puts the whole site in English, keeps it there, and switches back", async ({ page }) => {
    await page.goto("/how-it-works");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jinsi MalFleks inavyofanya kazi");
    await expect(toggle(page, "Kiswahili")).toHaveAttribute("aria-pressed", "true");

    await toggle(page, "English").click();

    // The same page, at the same address, in the other language.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("How MalFleks works");
    await expect(page).toHaveURL(/\/how-it-works$/);
    await expect(toggle(page, "English")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    // And every page after it.
    await page.locator("header").getByRole("link", { name: "Brands", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("All brands");
    await page.goto("/search");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Search the whole marketplace");

    await toggle(page, "Kiswahili").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tafuta kwenye soko zima");
  });

  test("keeps what was being searched for", async ({ page }) => {
    await page.goto("/search?q=corolla");
    await toggle(page, "English").click();
    await expect(page).toHaveURL(/\/search\?q=corolla$/);
    await expect(page.getByRole("searchbox")).toHaveValue("corolla");
  });
});

test.describe("an address that names its language", () => {
  test.use({ storageState: noChoice });

  test("is served in that language, and the visitor stays in it", async ({ page }) => {
    // As from a search result or a shared link.
    await page.goto("/en/search");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Search the whole marketplace");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "http://localhost:3000/en/search");

    await page.locator("header").getByRole("link", { name: "Brands", exact: true }).click();
    await expect(page).toHaveURL(/\/brands$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("All brands");
  });
});

test.describe("the legal pages in Swahili", () => {
  test.use({ storageState: noChoice });

  test("say the English version decides, and reading it does not change the reader's language", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Masharti ya matumizi");
    await expect(page.getByTestId("english-decides")).toContainText("toleo la Kiingereza ndilo linaloamua");

    await page.getByRole("link", { name: "Soma toleo la Kiingereza" }).click();
    await expect(page).toHaveURL(/\/en\/terms$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms of use");

    // Having looked at one page in English, the reader is still a Swahili reader.
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Faragha");
    await expect(page.getByText("kukumbuka lugha uliyochagua")).toBeVisible();
  });
});

test.describe("what search engines are given", () => {
  test("the Swahili questions, in Swahili", async ({ page }) => {
    await page.goto("/sw/how-it-works");
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const faq = blocks.map((text) => JSON.parse(text)).find((data) => data["@type"] === "FAQPage");
    expect(faq.inLanguage).toBe("sw");
    expect(faq.mainEntity).toHaveLength(10);
    expect(faq.mainEntity[0].name).toBe("Je, ni salama kulipa kabla mzigo haujafika?");
  });

  test("every page in both languages, each naming the other", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const address of ["/sw</loc>", "/en</loc>", "/sw/how-it-works</loc>", "/en/search</loc>", "/sw/products/toyota-corolla</loc>"]) {
      expect(sitemap, address).toContain(address);
    }
    expect(sitemap).toContain('hreflang="sw"');
    expect(sitemap).toContain('hreflang="en"');
    // The plain addresses are for people; the sitemap lists the ones that say their language.
    expect(sitemap).not.toMatch(/localhost:3000\/search<\/loc>/);
  });

  test("private pages are kept out in both languages", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    for (const path of ["/account", "/sw/account", "/en/account", "/sw/pay/", "/en/partner"]) {
      expect(robots, path).toContain(`Disallow: ${path}`);
    }
  });
});
