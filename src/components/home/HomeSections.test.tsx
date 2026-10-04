import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { branches, brands, products } from "@/data";
import { BUYER_STEPS } from "@/lib/how-it-works";
import { PROMISE } from "@/lib/promise";
import HomeHero from "./HomeHero";
import { HOME_PRODUCT_LIMIT, HomePartners, HomeProducts, HomeShops, HomeSteps, listCities, pickHomeProducts } from "./HomeSections";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// `ProductCard` wraps its picture in React's `ViewTransition`, which exists
// only in the canary build Next bundles -- not in the React the tests run on.
// It draws nothing of its own, so here it is a pass-through.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  ViewTransition: ({ children }: { children: React.ReactNode }) => children,
}));

/**
 * The home page leads with the promise and shows what is really there. These
 * hold the two things it used to get wrong: the promise was the second thing
 * on the page, and the page opened by counting how few shops it had.
 */
describe("the first screen", () => {
  it("is the promise, as the page's one main heading, in both languages", () => {
    render(<HomeHero />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(PROMISE.headline);
    expect(screen.getByText(PROMISE.swahili)).toHaveAttribute("lang", "sw");
  });

  it("offers one way to shop and one way to understand, and nothing else", () => {
    render(<HomeHero />);

    expect(screen.getByRole("link", { name: "Search products" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/how-it-works");
    // The only other link is the one to the same page in Swahili.
    expect(screen.getByRole("link", { name: /Kiswahili/ })).toHaveAttribute("href", "/sw");
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("is the same screen in Swahili, leading on to the Swahili explanation", () => {
    render(<HomeHero locale="sw" />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pesa yako inalindwa mpaka mzigo ufike");
    expect(screen.getByText(PROMISE.headline)).toHaveAttribute("lang", "en");
    expect(screen.getByRole("link", { name: "Tafuta bidhaa" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "Jinsi inavyofanya kazi" })).toHaveAttribute("href", "/sw/how-it-works");
    expect(screen.getByRole("link", { name: /English/ })).toHaveAttribute("href", "/");
    // Search, ordering and paying are not translated; the page says so here.
    expect(screen.getByTestId("untranslated-note")).toHaveTextContent(/Kiingereza/);
    expect(within(screen.getByRole("figure")).getAllByRole("listitem")[1]).toHaveTextContent("MalFleks inashikilia pesa yako");
  });

  it("shows where the money is at each step, ending with the refund", () => {
    render(<HomeHero />);

    const steps = within(screen.getByRole("figure")).getAllByRole("listitem").map((item) => item.textContent);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatch(/You pay MalFleks/);
    expect(steps[1]).toMatch(/MalFleks holds your money/);
    expect(steps[2]).toMatch(/The shop is paid.*after your order has been delivered/);
    expect(screen.getByText(/you get the full amount back/)).toBeVisible();
  });

  it("counts nothing", () => {
    // "2 brands · 2 branches · 1 city" told a first-time visitor how small the
    // marketplace was before it told them what it was for.
    const { container } = render(<HomeHero />);
    expect(container.textContent).not.toMatch(/\d+\s*(brands?|branches|cit(y|ies)|shops?)\b/i);
  });
});

describe("pickHomeProducts", () => {
  it("shows what is in stock before what is not, and no more than the page has room for", () => {
    const picks = pickHomeProducts(brands, products);

    expect(picks).toHaveLength(Math.min(HOME_PRODUCT_LIMIT, products.length));
    const firstOut = picks.findIndex((pick) => !pick.product.inStock);
    if (firstOut !== -1) {
      expect(picks.slice(firstOut).every((pick) => !pick.product.inStock)).toBe(true);
    }
  });

  it("pairs each product with its own brand, and drops one whose shop is not on the site", () => {
    const onlyToyota = brands.filter((brand) => brand.id === "toyota");
    const picks = pickHomeProducts(onlyToyota, products, 100);

    expect(picks.length).toBeGreaterThan(0);
    for (const { product, brand } of picks) {
      expect(product.brandId).toBe("toyota");
      expect(brand.id).toBe("toyota");
    }
  });

  it("is empty for an empty catalogue", () => {
    expect(pickHomeProducts(brands, [])).toEqual([]);
    expect(pickHomeProducts([], products)).toEqual([]);
  });
});

describe("the catalogue sections", () => {
  it("shows real products, each a link to its own page, with a way to see the rest", () => {
    render(<HomeProducts brands={brands} products={products} />);

    const section = screen.getByRole("region", { name: "In the shops now" });
    const hrefs = within(section).getAllByRole("link").map((link) => link.getAttribute("href"));
    for (const { product } of pickHomeProducts(brands, products)) {
      expect(hrefs).toContain(`/products/${product.id}`);
    }
    expect(within(section).getByRole("link", { name: "See all products" })).toHaveAttribute("href", "/search");
  });

  it("draws no products section at all when there is nothing to sell", () => {
    const { container } = render(<HomeProducts brands={brands} products={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the cities the shops are in, read from the shops themselves", () => {
    const dodoma = branches.filter((branch) => branch.city === "Dodoma");
    render(<HomeShops brands={brands} branches={dodoma} />);

    expect(screen.getByText(/Delivering in Dodoma\. Each shop delivers within its own city\./)).toBeVisible();
    expect(screen.getByRole("link", { name: "Find a shop near you" })).toHaveAttribute("href", "/locator");
  });
});

describe("listCities", () => {
  const inCities = (...cities: string[]) => cities.map((city, index) => ({ ...branches[0], id: `b${index}`, city }));

  it("reads as a sentence however many there are", () => {
    expect(listCities([])).toBe("");
    expect(listCities(inCities("Dodoma"))).toBe("Dodoma");
    expect(listCities(inCities("Dodoma", "Arusha"))).toBe("Arusha and Dodoma");
    expect(listCities(inCities("Mwanza", "Dodoma", "Arusha", "Dodoma"))).toBe("Arusha, Dodoma and Mwanza");
  });
});

describe("the rest of the page", () => {
  it("tells the buying steps in the same words as the “How it works” page", () => {
    render(<HomeSteps />);

    const headings = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(headings).toEqual(BUYER_STEPS.map((step) => step.title));
    expect(screen.getByRole("link", { name: /Questions about paying/ })).toHaveAttribute("href", "/how-it-works");
  });

  it("asks a shop or courier one thing", () => {
    render(<HomePartners />);
    expect(screen.getByRole("link", { name: "Become a partner" })).toHaveAttribute("href", "/apply");
  });
});
