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

    // On a phone, this is the whole feature. Grouped for reading; the link
    // itself still dials the number exactly as stored.
    expect(
      screen.getByRole("link", { name: "+255 754 123 456" }),
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

  // Since 3 Oct 2026 customers pay as they order, so these are the two states
  // a branch actually sees.
  it("shows an unpaid order as waiting on the customer, with nothing to press", () => {
    render(
      <PartnerOrderCard
        order={{ ...base, payment: { status: "pending", checkoutLink: "https://checkout.clickpesa.com/X" } } as ListedOrder}
        canDecide
      />,
    );

    expect(screen.getByText("Not paid yet")).toBeVisible();
    expect(screen.queryByRole("button", { name: /confirm MALFLEKS-4F2A/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /can't fulfil/i })).not.toBeInTheDocument();
  });

  it("on a paid order offers “Can't fulfil” and no confirm — the payment already confirmed it", () => {
    render(
      <PartnerOrderCard
        order={{ ...base, status: "confirmed", payment: { status: "captured", checkoutLink: null } } as ListedOrder}
        canDecide
      />,
    );

    expect(screen.getByText("Paid — deliver now")).toBeVisible();
    expect(screen.getByText(/Paid through MalFleks/)).toBeVisible();
    expect(screen.getByRole("button", { name: /can't fulfil MALFLEKS-4F2A/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^confirm MALFLEKS-4F2A/i })).not.toBeInTheDocument();
  });

  // "The shop is paid after delivery" is only true if nothing is delivered
  // before it is paid for. Until 4 Oct 2026 a confirmed order that had not
  // been paid drew "Mark delivered" and the location button under a sentence
  // telling the branch not to hand anything over.
  describe("delivery controls", () => {
    // Until 5 Oct 2026 this was a "Mark delivered" button: the person paid for
    // the delivery was the only one who said it happened. Now they must type
    // the code the customer holds.
    it("asks for the customer's delivery code on a confirmed order that has been paid for", () => {
      render(<PartnerOrderCard order={{ ...base, status: "confirmed", payment: { status: "captured", checkoutLink: null } } as ListedOrder} />);
      expect(screen.getByLabelText(`Delivery code for ${base.reference}`)).toBeVisible();
      expect(screen.getByRole("button", { name: "Confirm delivery" })).toBeVisible();
      expect(screen.getByRole("button", { name: "I can't enter the code" })).toBeVisible();
      expect(screen.queryByRole("button", { name: "Mark delivered" })).not.toBeInTheDocument();
    });

    it("never shows the code itself: the card is not given one", () => {
      const { container } = render(
        <PartnerOrderCard order={{ ...base, status: "confirmed", payment: { status: "captured", checkoutLink: null } } as ListedOrder} />,
      );
      expect(screen.getByLabelText(`Delivery code for ${base.reference}`)).toHaveValue("");
      expect(container.textContent).not.toMatch(/\b\d{6}\b/);
    });

    it("says the order is locked, and offers no entry, after too many wrong codes", () => {
      render(
        <PartnerOrderCard
          order={{ ...base, status: "confirmed", payment: { status: "captured", checkoutLink: null } } as ListedOrder}
          codeState={{ lockedUntil: null, adminOnly: true, problemReported: false }}
        />,
      );
      expect(screen.getByText(/this order is locked/)).toBeVisible();
      expect(screen.queryByRole("button", { name: "Confirm delivery" })).not.toBeInTheDocument();
    });

    it("offers nothing on a confirmed order whose payment is still open, and says it is not paid", () => {
      render(
        <PartnerOrderCard
          order={{ ...base, status: "confirmed", payment: { status: "pending", checkoutLink: "https://checkout.clickpesa.com/X" } } as ListedOrder}
          canDecide
        />,
      );
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.getByText("Not paid yet")).toBeVisible();
      expect(screen.getByText(/hasn't paid yet/)).toBeVisible();
    });

    // The live case (ORA-DOD-UE6F): confirmed before paying was required, so
    // it has no payment at all -- and used to show no payment line either.
    it("treats a confirmed order with no payment on record the same way", () => {
      render(<PartnerOrderCard order={{ ...base, status: "confirmed", payment: null } as ListedOrder} canDecide />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.getByText("Not paid yet")).toBeVisible();
      expect(screen.getByText(/don't hand anything\s+over before then/)).toBeVisible();
    });
  });
});
