import { describe, it, expect } from "vitest";
import { lakeVictoriaPath, projectPercent, tanzaniaPath } from "./geo";

const DAR = { lat: -6.7924, lng: 39.2083 };
const MWANZA = { lat: -2.5164, lng: 32.9175 };
const DODOMA = { lat: -6.163, lng: 35.7516 };
const ARUSHA = { lat: -3.3869, lng: 36.683 };

describe("projectPercent", () => {
  it("keeps every Tanzanian city inside the map box", () => {
    for (const city of [DAR, MWANZA, DODOMA, ARUSHA]) {
      const { left, top } = projectPercent(city);
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThan(100);
      expect(top).toBeGreaterThan(0);
      expect(top).toBeLessThan(100);
    }
  });

  it("puts east further right and north further up", () => {
    // Dar is on the coast, Mwanza is inland on Lake Victoria.
    expect(projectPercent(DAR).left).toBeGreaterThan(
      projectPercent(MWANZA).left
    );
    // Mwanza is the northernmost of the four.
    expect(projectPercent(MWANZA).top).toBeLessThan(projectPercent(DODOMA).top);
  });

  it("places Dodoma near the middle, as the inland capital should be", () => {
    const { left, top } = projectPercent(DODOMA);
    expect(left).toBeGreaterThan(40);
    expect(left).toBeLessThan(70);
    expect(top).toBeGreaterThan(35);
    expect(top).toBeLessThan(65);
  });
});

describe("outline paths", () => {
  it("are closed and start from a move command", () => {
    for (const path of [tanzaniaPath, lakeVictoriaPath]) {
      expect(path.startsWith("M")).toBe(true);
      expect(path.endsWith("Z")).toBe(true);
      expect(path).not.toContain("NaN");
    }
  });
});
