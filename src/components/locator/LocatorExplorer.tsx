"use client";

import { useSearchParams } from "next/navigation";
import CityLocator from "./CityLocator";
import { filtersFromParams } from "./locator";

/**
 * Reads a shared `/locator?city=…&brand=…` link into the locator's opening
 * state. Deliberately thin: keeping the router out of `CityLocator` is what
 * lets the locator be tested as a plain component.
 */
export default function LocatorExplorer() {
  const searchParams = useSearchParams();
  // Only the entry URL matters — after that the locator owns its own state and
  // writes back to the URL, so re-reading here would fight it.
  const initialFilters = filtersFromParams(
    new URLSearchParams(searchParams.toString())
  );

  return <CityLocator initialFilters={initialFilters} />;
}
