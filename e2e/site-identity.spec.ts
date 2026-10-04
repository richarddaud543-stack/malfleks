import { test, expect } from "@playwright/test";

// What the site says about itself to a browser, a search engine and a chat
// app. None of this existed before 4 Oct 2026: the tab showed the hosting
// provider's icon, a shared link had no preview, and the description still
// described a brand directory.

test.describe("site identity", () => {
  test("the home page leads with the promise and carries a share preview", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("MalFleks — Your money is held until your order arrives");

    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", /holds your payment until your order arrives/);
    await expect(description).toHaveAttribute("content", /Pesa yako inalindwa mpaka mzigo ufike/);
    await expect(description).not.toHaveAttribute("content", /authori[sz]ed/i);

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Your money is held/);
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "MalFleks");
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");

    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(image).toBeTruthy();
    const picture = await page.request.get(image!);
    expect(picture.ok()).toBe(true);
    expect(picture.headers()["content-type"]).toContain("image/png");
  });

  test("every page names its own address as the one to index", async ({ page }) => {
    for (const [path, canonical] of [
      // Each page exists once per language, and names the address of the
      // language it is in. These specs browse in English.
      ["/", "http://localhost:3000/en"],
      ["/search?q=corolla", "http://localhost:3000/en/search"],
      ["/products/toyota-corolla", "http://localhost:3000/en/products/toyota-corolla"],
      ["/how-it-works", "http://localhost:3000/en/how-it-works"],
    ]) {
      await page.goto(path);
      const href = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(href?.replace(/\/$/, ""), path).toBe(canonical);
    }
  });

  test("the icon is MalFleks's own, in the sizes a phone asks for", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", /\/icon\//);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /\/apple-icon/);

    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.name).toBe("MalFleks");
    for (const icon of manifest.icons) {
      const response = await request.get(icon.src);
      expect(response.ok(), icon.src).toBe(true);
      expect(response.headers()["content-type"]).toContain("image/png");
    }
  });

  test("search engines are told who MalFleks is", async ({ page }) => {
    await page.goto("/");
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const graph = blocks.map((text) => JSON.parse(text)).find((data) => data["@graph"])?.["@graph"];
    expect(graph?.map((node: { "@type": string }) => node["@type"])).toEqual(["Organization", "WebSite"]);
  });

  test("the order form and the sign-in page ask not to be listed, and the product page does not", async ({ page }) => {
    await page.goto("/delivery/toyota-corolla");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    await page.goto("/sign-in");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    await page.goto("/products/toyota-corolla");
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });
});

test.describe("how MalFleks works", () => {
  test("explains the promise in plain words and answers the first question people ask", async ({ page }) => {
    await page.goto("/how-it-works");

    await expect(page.getByRole("heading", { name: "How MalFleks works", level: 1 })).toBeVisible();
    await expect(page.getByText("Is it safe to pay before my order arrives?")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Selling through MalFleks" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Delivering for MalFleks" })).toBeVisible();

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const faq = blocks.map((text) => JSON.parse(text)).find((data) => data["@type"] === "FAQPage");
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(8);
  });

  test("is one tap from the footer and from the promise card", async ({ page }) => {
    await page.goto("/products/toyota-corolla");
    await expect(page.getByRole("link", { name: "How paying and refunds work" }).first()).toHaveAttribute("href", "/how-it-works");
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "How MalFleks works" })).toHaveAttribute("href", "/how-it-works");
  });
});

test.describe("browser safety headers", () => {
  test("every page forbids framing and sniffing, and keeps page addresses to itself", async ({ request }) => {
    for (const path of ["/", "/products/toyota-corolla", "/sign-in", "/api/auth/session"]) {
      const headers = (await request.get(path)).headers();
      expect(headers["x-content-type-options"], path).toBe("nosniff");
      expect(headers["x-frame-options"], path).toBe("DENY");
      expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
      expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
      // A courier reports where a delivery is; nothing else needs a device permission.
      expect(headers["permissions-policy"], path).toContain("geolocation=(self)");
      expect(headers["permissions-policy"], path).toContain("camera=()");
      expect(headers["x-powered-by"], path).toBeUndefined();
    }
  });

  test("the sign-in page keeps its own opener isolation as well", async ({ request }) => {
    const headers = (await request.get("/sign-in")).headers();
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  });

  test("security.txt says where to report a problem, and when it expires", async ({ request }) => {
    const response = await request.get("/.well-known/security.txt");
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("text/plain");

    const body = await response.text();
    expect(body).toMatch(/^Contact: mailto:\S+@\S+$/m);
    const expires = /^Expires: (.+)$/m.exec(body)?.[1];
    expect(Date.parse(expires!)).toBeGreaterThan(Date.now());
  });

  test("robots.txt welcomes crawlers to the shop and keeps them out of private pages", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    expect(body).toMatch(/Allow: \/\n/);
    expect(body).toContain("Disallow: /account");
    expect(body).toContain("Disallow: /pay/");
    expect(body).toMatch(/Sitemap: .*\/sitemap\.xml/);
    // The product pages must stay readable.
    expect(body).not.toContain("Disallow: /products");
  });
});
