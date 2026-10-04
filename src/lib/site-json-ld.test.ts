import { describe, expect, it } from "vitest";

import { BUYER_STEPS, COURIER_STEPS, QUESTIONS, SELLER_STEPS } from "./how-it-works";
import { PROMISE } from "./promise";
import { SITE_DESCRIPTION, SITE_TITLE } from "./site-identity";
import { buildFaqJsonLd, buildSiteJsonLd } from "./site-json-ld";

describe("how MalFleks names itself outside its own pages", () => {
  it("leads with the promise, and fits where it is shown", () => {
    expect(SITE_TITLE).toContain(PROMISE.headline);
    // A search result cuts a title at about 60 characters and a description at about 160.
    expect(SITE_TITLE.length).toBeLessThanOrEqual(60);
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160);
    expect(SITE_DESCRIPTION).toContain(PROMISE.swahili);
  });

  // The description said "authorized brand branches" until 4 Oct 2026. Whether
  // any shop is authorised by its brand is the owner's open question, so the
  // site does not claim it anywhere a search engine will repeat it.
  it("does not claim the shops are authorised by the brands they sell", () => {
    expect(`${SITE_TITLE} ${SITE_DESCRIPTION}`).not.toMatch(/authori[sz]ed/i);
  });
});

describe("buildSiteJsonLd", () => {
  const data = buildSiteJsonLd({ siteUrl: "https://shop.example/", contactEmail: "hello@shop.example" });
  const [organization, website] = data["@graph"];

  it("describes the organisation with what is on the public pages, and nothing invented", () => {
    expect(organization).toMatchObject({
      "@type": "Organization",
      "@id": "https://shop.example/#organization",
      name: "MalFleks",
      url: "https://shop.example/",
      logo: "https://shop.example/icon/512",
      email: "hello@shop.example",
    });
    // None of these exist yet. They are added when the owner has them.
    for (const absent of ["address", "telephone", "taxID", "legalName", "sameAs"]) {
      expect(organization).not.toHaveProperty(absent);
    }
  });

  it("points a search engine at the shop's own search, without a doubled slash", () => {
    expect(website).toMatchObject({
      "@type": "WebSite",
      publisher: { "@id": "https://shop.example/#organization" },
      potentialAction: { target: { urlTemplate: "https://shop.example/search?q={search_term_string}" } },
    });
  });
});

describe("the “How MalFleks works” page", () => {
  it("gives search engines the questions exactly as they are written on the page", () => {
    const faq = buildFaqJsonLd(QUESTIONS);
    expect(faq["@type"]).toBe("FAQPage");
    expect(faq.mainEntity).toHaveLength(QUESTIONS.length);
    faq.mainEntity.forEach((entry, index) => {
      expect(entry.name).toBe(QUESTIONS[index].question);
      expect(entry.acceptedAnswer.text).toBe(QUESTIONS[index].answer);
    });
  });

  it("asks each question once, and every one ends as a question", () => {
    const asked = QUESTIONS.map((q) => q.question);
    expect(new Set(asked).size).toBe(asked.length);
    for (const question of asked) expect(question).toMatch(/\?$/);
  });

  it("only links to pages on this site", () => {
    for (const { link } of QUESTIONS) {
      if (link) expect(link.href).toMatch(/^\/[a-z-]*$/);
    }
  });

  // What is not decided is not promised. A number of days for a refund or a
  // delivery, or a named mobile network, would be a promise nobody has made.
  it("promises no timings and names no mobile network", () => {
    const everything = [...QUESTIONS.map((q) => q.answer), ...[...BUYER_STEPS, ...SELLER_STEPS, ...COURIER_STEPS].map((s) => s.body)].join(" ");
    expect(everything).not.toMatch(/\b\d+\s*(day|hour|minute)s?\b/i);
    expect(everything).not.toMatch(/within\s+\w+\s+(day|hour)s?/i);
    expect(everything).not.toMatch(/m-?pesa|airtel|tigo|halopesa|mixx/i);
  });

  it("tells every role the same thing about the door: nothing is collected there", () => {
    expect(QUESTIONS.find((q) => q.question === "Do I pay anything at the door?")?.answer).toMatch(/^No\./);
    expect(SELLER_STEPS.map((s) => s.body).join(" ")).toMatch(/collect nothing at the door/);
    expect(COURIER_STEPS.map((s) => s.title).join(" ")).toMatch(/Collect nothing at the door/);
  });
});
