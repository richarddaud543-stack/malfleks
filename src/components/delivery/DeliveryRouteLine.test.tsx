import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DeliveryRouteLine from "./DeliveryRouteLine";
import type { DeliveryOutlook } from "@/lib/order";

function outlook(patch: Partial<DeliveryOutlook> = {}): DeliveryOutlook {
  return {
    kind: "agent",
    carrier: "Bolt Send",
    choiceCount: 1,
    eta: { minDays: 0, maxDays: 0 },
    unavailable: null,
    ...patch,
  };
}

describe("DeliveryRouteLine", () => {
  it("names the fleet on a brand route without inventing an arrival time", () => {
    render(
      <DeliveryRouteLine
        outlook={outlook({
          kind: "brand",
          carrier: "Toyota own fleet",
          choiceCount: 0,
          eta: null,
        })}
      />
    );

    expect(screen.getByText("Brand delivery").className).toContain(
      "text-emerald-400"
    );
    expect(screen.getByText("Toyota own fleet")).toBeVisible();
    // Nothing in the data says how fast a brand fleet is, so nothing may be
    // shown — this is the assertion that stops a plausible number creeping in.
    expect(screen.queryByText(/day/i)).toBeNull();
    expect(screen.queryByText(/same-day/i)).toBeNull();
  });

  it("leads with the arrival, then the courier, on a single-courier route", () => {
    render(<DeliveryRouteLine outlook={outlook()} />);

    expect(screen.getByText("Local agent delivery").className).toContain(
      "text-amber-400"
    );
    expect(screen.getByText("Same-day · Bolt Send")).toBeVisible();
  });

  it("counts the couriers rather than naming only the fastest", () => {
    render(<DeliveryRouteLine outlook={outlook({ choiceCount: 2 })} />);

    // Naming just Bolt Send would read as if it were the only option, when
    // the customer is about to be offered a choice.
    expect(screen.getByText("Same-day · 2 couriers")).toBeVisible();
    expect(screen.queryByText(/Bolt Send/)).toBeNull();
  });

  it("does not carry the card's 11px detail size onto a product page", () => {
    // Caught by looking at the rendered page, not by any assertion that
    // existed at the time: at `compact` the detail line is dwarfed beside a
    // 4xl heading and a 2xl price.
    const { unmount } = render(<DeliveryRouteLine outlook={outlook()} />);
    expect(screen.getByText("Same-day · Bolt Send").className).toContain(
      "text-[11px]"
    );
    unmount();

    render(<DeliveryRouteLine outlook={outlook()} size="prominent" />);
    const detail = screen.getByText("Same-day · Bolt Send");
    expect(detail.className).toContain("text-sm");
    expect(detail.className).not.toContain("text-[11px]");
  });

  it("drops the route entirely when the product cannot be ordered", () => {
    render(
      <DeliveryRouteLine outlook={outlook({ unavailable: "Out of stock" })} />
    );

    const chip = screen.getByText("Out of stock");
    // Neutral, not a fourth status colour: the route is moot, not amber.
    expect(chip.className).toContain("text-zinc-200");
    expect(chip.className).not.toContain("text-amber-400");
    // No delivery promise attached to something nobody can order.
    expect(screen.queryByText(/Local agent delivery/)).toBeNull();
    expect(screen.queryByText(/Same-day/)).toBeNull();
  });
});
