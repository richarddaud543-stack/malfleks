import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import PrivacyPage from "@/app/[lang]/privacy/page";
import TermsPage from "@/app/[lang]/terms/page";

vi.mock("next/navigation", () => ({ notFound: vi.fn(), useRouter: () => ({ push: vi.fn() }) }));

/**
 * The Terms and the Privacy notice exist in English and in a Swahili
 * translation, and the English one decides. A translation that has quietly
 * fallen behind is worse than none: it tells a Swahili reader something the
 * binding text no longer says. These hold the two together.
 */
async function draw(Page: typeof TermsPage, lang: "en" | "sw") {
  const { container } = render(await Page({ params: Promise.resolve({ lang }) }));
  return container;
}

const sections = (container: HTMLElement) => container.querySelectorAll("section").length;
const paragraphs = (container: HTMLElement) => container.querySelectorAll("section p, section li").length;

describe.each([
  ["Terms of use", TermsPage, "Masharti ya matumizi", "/en/terms"],
  ["Privacy", PrivacyPage, "Faragha", "/en/privacy"],
] as const)("%s", (english, Page, swahili, englishAddress) => {
  it("is the same page in both languages: the same sections, the same number of paragraphs", async () => {
    const en = await draw(Page, "en");
    const enShape = [sections(en), paragraphs(en)];
    const sw = await draw(Page, "sw");
    expect([sections(sw), paragraphs(sw)]).toEqual(enShape);
  });

  it("was last updated on the same day in both", async () => {
    const en = await draw(Page, "en");
    expect(en.textContent).toMatch(/Last updated 4 October 2026/);
    const sw = await draw(Page, "sw");
    expect(sw.textContent).toMatch(/tarehe 4 Oktoba 2026/);
  });

  it("says in Swahili that the English version decides, and links to it", async () => {
    await draw(Page, "sw");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(swahili);
    const note = screen.getByTestId("english-decides");
    expect(note).toHaveTextContent(/toleo la Kiingereza ndilo linaloamua/);
    expect(screen.getByRole("link", { name: "Soma toleo la Kiingereza" })).toHaveAttribute("href", englishAddress);
  });

  it("carries no such note on the English page, which is the text itself", async () => {
    await draw(Page, "en");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(english);
    expect(screen.queryByTestId("english-decides")).not.toBeInTheDocument();
  });
});

describe("the cookie paragraph", () => {
  // The language switch remembers the choice in a cookie. The notice said
  // cookies were for one thing only; it has to say two, in both languages.
  it("names the language cookie in both languages", async () => {
    const en = await draw(PrivacyPage, "en");
    expect(en.textContent).toMatch(/remembering the language you chose/);
    const sw = await draw(PrivacyPage, "sw");
    expect(sw.textContent).toMatch(/kukumbuka lugha uliyochagua/);
  });
});
