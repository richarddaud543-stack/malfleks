import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import PayPanel from "./PayPanel";
import type { CheckoutView } from "@/server/orders/checkout";

vi.mock("@/app/actions/checkout", () => ({
  checkoutStatusAction: vi.fn(async () => null),
  checkPaymentNowAction: vi.fn(async () => null),
}));

const BASE: CheckoutView = {
  reference: "ORA-DOD-N6CD",
  state: "ready",
  orderStatus: "confirmed",
  productName: "head sets",
  quantity: 2,
  unitPriceTZS: 2787,
  goodsTZS: 5574,
  deliveryFeeTZS: 0,
  totalTZS: 5574,
  branchName: "oraimo — Dodoma",
  branchCity: "Dodoma",
  routeKind: "brand",
  routeCarrier: "oraimo",
  customerPhone: "+255754123456",
  checkoutLink: "https://checkout.clickpesa.com/CHE123",
  lastAttemptFailed: false,
  paidAt: null,
  paymentReference: null,
  cancelReason: null,
};

/**
 * The one rule: a Pay button exists only when there is something to pay, and
 * it says the exact amount. Every other state must make it impossible to pay
 * by mistake.
 */
describe("PayPanel", () => {
  it("ready: one pay button, with the exact total, going to the ClickPesa link", () => {
    render(<PayPanel initial={BASE} />);
    const pay = screen.getByTestId("pay-button");
    expect(pay).toHaveTextContent("5,574");
    expect(pay).toHaveAttribute("href", BASE.checkoutLink);
    expect(pay).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByTestId("pay-total")).toHaveTextContent("5,574");
  });

  it("ready after a failed attempt: says nothing was taken", () => {
    render(<PayPanel initial={{ ...BASE, lastAttemptFailed: true }} />);
    expect(screen.getByText(/nothing was taken/i)).toBeInTheDocument();
    expect(screen.getByTestId("pay-button")).toBeInTheDocument();
  });

  it.each([
    ["waiting", /waiting for the branch/i],
    ["paid", /paid — thank you/i],
    ["cancelled", /this order was cancelled/i],
    ["unavailable", /isn.t open for this order yet/i],
  ] as const)("%s: no pay button", (state, heading) => {
    render(<PayPanel initial={{ ...BASE, state, checkoutLink: null, paymentReference: state === "paid" ? "CP1" : null }} />);
    expect(screen.queryByTestId("pay-button")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });
});
