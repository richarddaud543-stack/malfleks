import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import CityLocator from "./CityLocator";

/** Markers read "<city>, <n> branches" — the count is part of the accessible
 *  name so a screen-reader user gets the weighting the marker size conveys. */
function marker(city: string) {
  return screen.getByRole("button", { name: new RegExp(`^${city},`) });
}

function brandChip(name: string) {
  return screen.getByRole("button", { name: new RegExp(`^${name}\\s*\\d+$`) });
}

function branchNames() {
  return screen
    .getAllByTestId("locator-branch")
    .map((el) => within(el).getByRole("heading").textContent);
}

const coverage = () => screen.getByRole("region", { name: /who delivers/i });

describe("CityLocator", () => {
  it("lists every branch in the country before anything is selected", () => {
    render(<CityLocator />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "19 branches across Tanzania"
    );
    expect(screen.getAllByTestId("locator-branch")).toHaveLength(19);
  });

  it("plots one marker per city, weighted by branch count", () => {
    render(<CityLocator />);
    expect(marker("Dar es Salaam")).toHaveAccessibleName(
      "Dar es Salaam, 7 branches"
    );
    expect(marker("Dodoma")).toHaveAccessibleName("Dodoma, 2 branches");
  });

  it("makes each marker a real, focusable button rather than a clickable div", () => {
    render(<CityLocator />);
    const dodoma = marker("Dodoma");
    expect(dodoma.tagName).toBe("BUTTON");
    dodoma.focus();
    expect(dodoma).toHaveFocus();
  });

  it("filters the list to a city when its marker is activated", () => {
    render(<CityLocator />);

    fireEvent.click(marker("Mwanza"));

    expect(marker("Mwanza")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("4 branches in Mwanza");
    for (const name of branchNames()) {
      expect(name).toContain("Mwanza");
    }
  });

  it("returns to every branch when the selected marker is activated again", () => {
    render(<CityLocator />);

    fireEvent.click(marker("Arusha"));
    expect(screen.getByRole("status")).toHaveTextContent("6 branches in Arusha");

    fireEvent.click(marker("Arusha"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "19 branches across Tanzania"
    );
    expect(marker("Arusha")).toHaveAttribute("aria-pressed", "false");
  });

  it("combines a brand filter with the selected city", () => {
    render(<CityLocator />);

    fireEvent.click(brandChip("Halotel"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "4 branches across Tanzania"
    );

    fireEvent.click(marker("Dar es Salaam"));
    expect(branchNames()).toEqual(["Halotel Shop — Dar es Salaam"]);
  });

  it("reweights the markers when a brand is filtered", () => {
    render(<CityLocator />);

    fireEvent.click(brandChip("Toyota"));

    expect(marker("Dar es Salaam")).toHaveAccessibleName(
      "Dar es Salaam, 1 branch"
    );
    // Toyota has nothing in Dodoma: the marker stays put but goes inert, so the
    // map's shape never changes under you.
    expect(marker("Dodoma")).toHaveAccessibleName("Dodoma, 0 branches");
    expect(marker("Dodoma")).toBeDisabled();
  });

  it("offers a way back out of an empty result", () => {
    render(
      <CityLocator initialFilters={{ city: "Dodoma", brandIds: ["bmw"] }} />
    );

    expect(screen.getByRole("status")).toHaveTextContent("No branches match");
    expect(screen.queryAllByTestId("locator-branch")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Show every branch" }));

    expect(screen.getAllByTestId("locator-branch")).toHaveLength(19);
  });

  it("opens on the city from a shared link", () => {
    render(<CityLocator initialFilters={{ city: "Arusha", brandIds: [] }} />);
    expect(screen.getByRole("status")).toHaveTextContent("6 branches in Arusha");
    expect(marker("Arusha")).toHaveAttribute("aria-pressed", "true");
  });

  it("links a branch through to its brand's branch page", () => {
    render(<CityLocator initialFilters={{ city: "Dodoma", brandIds: [] }} />);
    expect(screen.getAllByTestId("locator-branch")[0]).toHaveAttribute(
      "href",
      "/brands/ford/branches/ford-dodoma"
    );
  });

  it("shows the couriers covering the selected city, and all four otherwise", () => {
    render(<CityLocator />);

    // Fargo covers all four cities, so it appears once per city up front.
    expect(within(coverage()).getAllByText("Fargo Courier")).toHaveLength(4);

    fireEvent.click(marker("Mwanza"));

    expect(within(coverage()).getAllByText("Fargo Courier")).toHaveLength(1);
    expect(
      within(coverage()).getByText("Mwanza Express Riders")
    ).toBeInTheDocument();
    expect(
      within(coverage()).queryByText("Dodoma Trusted Delivery")
    ).not.toBeInTheDocument();
  });

  it("shows the delivery status of every branch", () => {
    render(<CityLocator initialFilters={{ city: "Dodoma", brandIds: [] }} />);
    // Neither Dodoma branch runs its own fleet, so both hand off to an agent.
    for (const card of screen.getAllByTestId("locator-branch")) {
      expect(within(card).getByText("Local agent delivery")).toBeInTheDocument();
    }
  });

  it("keeps a shared link in step with what is on screen", () => {
    render(<CityLocator />);

    fireEvent.click(marker("Mwanza"));
    fireEvent.click(brandChip("BMW"));

    expect(window.location.search).toBe("?city=Mwanza&brand=bmw");
  });

  it("narrows the list live as you type into the search field, and joins the URL", () => {
    render(<CityLocator />);

    const search = screen.getByRole("searchbox", { name: /search branches/i });
    fireEvent.change(search, { target: { value: "Kariakoo" } });

    expect(screen.getByRole("status")).toHaveTextContent(
      "1 branch across Tanzania"
    );
    expect(branchNames()).toEqual(["Oraimo Store — Kariakoo"]);
    expect(window.location.search).toBe("?q=Kariakoo");
  });

  it("joins the search query with the city and brand filters already selected", () => {
    render(<CityLocator />);

    fireEvent.click(marker("Dar es Salaam"));
    const search = screen.getByRole("searchbox", { name: /search branches/i });
    fireEvent.change(search, { target: { value: "halotel" } });

    expect(screen.getByRole("status")).toHaveTextContent(
      "1 branch in Dar es Salaam"
    );
    expect(branchNames()).toEqual(["Halotel Shop — Dar es Salaam"]);
  });

  it("clears the search field via its own clear button", () => {
    render(<CityLocator />);

    const search = screen.getByRole("searchbox", { name: /search branches/i });
    fireEvent.change(search, { target: { value: "Kariakoo" } });
    expect(branchNames()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(search).toHaveValue("");
    expect(screen.getAllByTestId("locator-branch")).toHaveLength(19);
  });

  it("pairs a hovered branch card with its city's marker on the map", () => {
    render(<CityLocator />);

    const heading = screen
      .getAllByRole("heading")
      .find((h) => /Mwanza$/.test(h.textContent ?? ""));
    const row = heading!.closest("li")!;
    const pin = marker("Mwanza").firstElementChild as HTMLElement;

    expect(pin).not.toHaveClass("border-accent");

    fireEvent.mouseEnter(row);
    expect(pin).toHaveClass("border-accent");

    fireEvent.mouseLeave(row);
    expect(pin).not.toHaveClass("border-accent");
  });

  it("pairs a hovered marker with its matching branch cards in the list", () => {
    render(<CityLocator />);

    const heading = screen
      .getAllByRole("heading")
      .find((h) => /Dodoma$/.test(h.textContent ?? ""));
    const card = heading!.closest(
      '[data-testid="locator-branch"]'
    ) as HTMLElement;

    // jest-dom's `toHaveStyle` doesn't resolve CSS custom properties in
    // jsdom, so it reads an inline `var(--accent)` value as unset even
    // though it's genuinely on the element — asserting the inline style
    // directly is what actually exercises the pairing logic.
    fireEvent.mouseEnter(marker("Dodoma"));
    expect(card.style.borderColor).toBe("var(--accent)");

    fireEvent.mouseLeave(marker("Dodoma"));
    expect(card.style.borderColor).toBe("");
  });
});
