import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { getBranchById, getBrandById, getProductById } from "@/data";
import type { Branch, Brand, DeliveryAgent, Product } from "@/data";
import {
  ORDER_STORAGE_KEY,
  createOrderRequest,
  resolveDeliveryRoute,
  serializeOrderRequest,
} from "@/lib/order";
import OrderConfirmation from "./OrderConfirmation";

function store(kind: "brand" | "agent" | "brand-no-phone") {
  const productId =
    kind === "agent"
      ? "toyota-hilux"
      : // `oraimo-dar` delivers its own orders but has no published phone —
        // 15 of the 19 seed branches don't. See the no-phone case below.
        kind === "brand-no-phone"
        ? "oraimo-freepods-4"
        : "toyota-corolla";
  const product = getProductById(productId) as Product;
  const brand = getBrandById(product.brandId) as Brand;
  const branch = getBranchById(product.branchId) as Branch;
  const agent =
    kind === "agent"
      ? (resolveDeliveryRoute(branch).agents.find(
          (a) => a.id === "arusha-swift-couriers"
        ) as DeliveryAgent)
      : null;

  const request = createOrderRequest({
    product,
    brand,
    branch,
    order: {
      quantity: 2,
      fullName: "Neema Mushi",
      phone: "+255754123456",
      address: "12 Sokoine Road, Arusha",
      agent,
    },
  });

  sessionStorage.setItem(ORDER_STORAGE_KEY, serializeOrderRequest(request));
  return request;
}

describe("OrderConfirmation", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("says plainly when there is no request in this tab", () => {
    render(<OrderConfirmation />);

    expect(
      screen.getByRole("heading", { name: "No order request to show" })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("order-reference")).not.toBeInTheDocument();
  });

  it("treats a corrupted stored record as no request rather than crashing", () => {
    sessionStorage.setItem(ORDER_STORAGE_KEY, '{"reference":"TOY-DAR-K7M4"}');
    render(<OrderConfirmation />);

    expect(
      screen.getByRole("heading", { name: "No order request to show" })
    ).toBeInTheDocument();
  });

  it("shows the reference and points a brand-delivered order at the branch", () => {
    const request = store("brand");
    render(<OrderConfirmation />);

    expect(screen.getByTestId("order-reference")).toHaveTextContent(
      request.reference
    );
    expect(screen.getByText("Brand delivery")).toBeVisible();
    expect(screen.getByText("Toyota own fleet")).toBeVisible();
    // The customer is told this is a request, not a purchase.
    expect(screen.getByText(/Nothing has been paid/)).toBeVisible();
  });

  it("points an agent-delivered order at the chosen courier's phone", () => {
    store("agent");
    render(<OrderConfirmation />);

    expect(screen.getByText("Local agent delivery")).toBeVisible();
    // Named both in the summary and in the "what happens next" steps.
    expect(screen.getAllByText(/Arusha Swift Couriers/)).toHaveLength(2);
    // The whole point of the agent route: a number the customer can call.
    expect(screen.getByText(/\+255 68 000 0003/)).toBeVisible();
  });

  // The whole flow exists to hand the customer to the branch, so the last
  // step must never be "call the branch" with no number to call — which is
  // what it was for the 15 seed branches that publish none.
  it("sends a brand-delivered order to the counter when the branch has no phone", () => {
    store("brand-no-phone");
    render(<OrderConfirmation />);

    expect(screen.getByText(/take your reference to the counter/)).toBeVisible();
    expect(screen.queryByText(/Call the branch on/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "address and opening hours" })
    ).toHaveAttribute("href", "/brands/oraimo/branches/oraimo-dar");
  });

  it("still gives the number when the branch publishes one", () => {
    store("brand");
    render(<OrderConfirmation />);

    expect(screen.getByText(/Call the branch on/)).toBeVisible();
    expect(
      screen.queryByText(/take your reference to the counter/)
    ).not.toBeInTheDocument();
  });

  it("formats the customer's phone number back for reading", () => {
    store("brand");
    render(<OrderConfirmation />);

    expect(screen.getByText("+255 754 123 456")).toBeVisible();
  });
});
