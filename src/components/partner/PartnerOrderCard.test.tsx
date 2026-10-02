import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ListedOrder } from "@/server/orders/list-orders";
import PartnerOrderCard from "./PartnerOrderCard";

/**
 * What a shopkeeper needs in the first two seconds: who to call, what they
 * want, and the reference to quote.
 *
 * Until this card existed the branch had no way to learn an order had been
 * placed at all — only MalFleks admin could see it — so every sale depended on
 * somebody relaying it by phone. The tests below hold the three facts that make
 * the page worth opening, and the one thing it must not do: offer status
 * buttons it has no authority to back.
 */

const base: ListedOrder = {
  id: "order-1",
  status: "pending",
  reference: "MALFLEKS-4F2A",
  customerId: "uid-1",
  customerFullName: "Neema Joseph",
  customerPhone: "+255754123456",
  customerAddress: "Mikocheni B, Dar es Salaam",
  productName: "Corolla Hybrid 2024",
  quantity: 1,
  unitPriceTZS: 48_500_000,
  lineTotalTZS: 48_500_000,
  brandName: "Toyota",
  branchId: "toyota-dar",
  branchName: "Toyota — Dar es Salaam",
  branchCity: "Dar es Salaam",
  branchPhone: null,
  routeKind: "brand",
  routeCarrier: "Toyota",
  routeAgentPhone: null,
  routeEtaEstimate: null,
  decidedAt: null,
  decisionNote: null,
  requestedAt: new Date("2026-09-01T09:00:00Z").toISOString(),
  createdAt: new Date("2026-09-01T09:00:00Z").toISOString(),
} as ListedOrder;

describe("PartnerOrderCard", () => {
  it("makes the customer's number a link you can press", () => {
    render(<PartnerOrderCard order={base} />);

    // On a phone, this is the whole feature.
    expect(
      screen.getByRole("link", { name: "+255754123456" }),
    ).toHaveAttribute("href", "tel:+255754123456");
  });

  it("shows the reference, the customer and what they asked for", () => {
    render(<PartnerOrderCard order={base} />);

    expect(screen.getByText("MALFLEKS-4F2A")).toBeVisible();
    expect(screen.getByText("Neema Joseph")).toBeVisible();
    expect(screen.getByText("Corolla Hybrid 2024")).toBeVisible();
    expect(screen.getByText(/Mikocheni B/)).toBeVisible();
  });

  it("shows the quantity and unit price only when there is more than one", () => {
    const { rerender } = render(<PartnerOrderCard order={base} />);
    expect(screen.queryByText(/each/)).not.toBeInTheDocument();

    rerender(
      <PartnerOrderCard
        order={{ ...base, quantity: 3, lineTotalTZS: 145_500_000 }}
      />,
    );
    expect(screen.getByText(/3 × Corolla Hybrid 2024/)).toBeVisible();
    expect(screen.getByText(/each/)).toBeVisible();
  });

  it("says who is delivering, and names the courier when it isn't the branch", () => {
    render(<PartnerOrderCard order={base} />);
    expect(screen.getByText(/delivering this one yourself/)).toBeVisible();

    render(
      <PartnerOrderCard
        order={{
          ...base,
          id: "order-2",
          routeKind: "agent",
          routeCarrier: "Pikipiki Express",
          routeEtaEstimate: "1–2 days",
          routeAgentPhone: "+255222000000",
        }}
      />,
    );
    expect(screen.getByText(/Pikipiki Express, 1–2 days/)).toBeVisible();
  });

  // Buttons appear only where the page has proved the viewer may decide.
  it("offers no decision buttons unless the page says this partner may decide", () => {
    render(<PartnerOrderCard order={base} />);

    // The page works out `canDecide` from the database (the branch's own
    // active partner, never a courier); the card must not guess.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("New — waiting on you")).toBeVisible();
  });

  it("lets the branch confirm or decline its own pending order", () => {
    render(<PartnerOrderCard order={base} canDecide />);

    expect(screen.getByRole("button", { name: /confirm MALFLEKS-4F2A/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /can't fulfil MALFLEKS-4F2A/i })).toBeVisible();
  });

  it("offers no decision on an order that is already decided", () => {
    render(<PartnerOrderCard order={{ ...base, status: "confirmed" }} canDecide />);
    expect(screen.queryByRole("button", { name: /confirm MALFLEKS-4F2A/i })).not.toBeInTheDocument();
  });

  it("labels a cancelled order as cancelled rather than as waiting", () => {
    render(<PartnerOrderCard order={{ ...base, status: "cancelled" }} />);

    expect(screen.getByText("Cancelled")).toBeVisible();
    expect(screen.queryByText("New — waiting on you")).not.toBeInTheDocument();
  });
});
