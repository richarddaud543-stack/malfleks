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

function store(kind: "brand" | "agent") {
  const productId = kind === "brand" ? "toyota-corolla" : "toyota-hilux";
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

  it("formats the customer's phone number back for reading", () => {
    store("brand");
    render(<OrderConfirmation />);

    expect(screen.getByText("+255 754 123 456")).toBeVisible();
  });
});
