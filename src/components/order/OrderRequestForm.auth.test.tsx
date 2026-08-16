import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getBranchById, getBrandById, getProductById } from "@/data";
import type { Branch, Brand, Product } from "@/data";
import { ORDER_STORAGE_KEY, parseOrderRequest, resolveDeliveryRoute } from "@/lib/order";
import { invalidateSessionState } from "@/components/auth/session-state";
import OrderRequestForm from "./OrderRequestForm";

/**
 * The rule this file exists to hold: **a signed-out customer's order request is
 * not transmitted anywhere.**
 *
 * Saving to an account is an addition. It must never become a gate, and it must
 * never quietly start sending a signed-out customer's name, phone number and
 * home address to a server. That is a promise the confirmation screen makes in
 * so many words ("Nothing was sent anywhere"), so it needs a test that fails
 * the day someone moves the check.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const saveOrderRequest = vi.fn();
vi.mock("@/app/actions/order-requests", () => ({
  saveOrderRequest: (...args: unknown[]) => saveOrderRequest(...args),
}));

function fixture(productId: string) {
  const product = getProductById(productId) as Product;
  const brand = getBrandById(product.brandId) as Brand;
  const branch = getBranchById(product.branchId) as Branch;
  return { product, brand, branch, route: resolveDeliveryRoute(branch) };
}

// A branch that runs its own fleet, so there is no agent choice in the way.
const brandDelivered = fixture("toyota-corolla");

/** Answers the one endpoint `useSessionState` calls. */
function mockSession(signedIn: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ signedIn, name: signedIn ? "Neema Mushi" : null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
  );
}

function fill() {
  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: "Neema Mushi" },
  });
  fireEvent.change(screen.getByLabelText(/Phone number/), {
    target: { value: "0754123456" },
  });
  fireEvent.change(screen.getByLabelText(/Delivery address/), {
    target: { value: "12 Sokoine Road, Arusha" },
  });
}

describe("OrderRequestForm and the customer's session", () => {
  beforeEach(() => {
    push.mockClear();
    saveOrderRequest.mockReset();
    sessionStorage.clear();
    invalidateSessionState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("transmits nothing at all when the customer is signed out", async () => {
    mockSession(false);
    render(<OrderRequestForm {...brandDelivered} />);
    // Let the session answer land, so this is a real signed-out state rather
    // than an unresolved one that happens to behave the same way.
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Confirm brand delivery" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/order/confirmation"));
    expect(saveOrderRequest).not.toHaveBeenCalled();

    // And the request is still there for the confirmation screen.
    const stored = parseOrderRequest(sessionStorage.getItem(ORDER_STORAGE_KEY));
    expect(stored?.customer.fullName).toBe("Neema Mushi");
    expect(stored?.savedToAccount).toBeUndefined();
  });

  it("does not transmit while the session answer is still in flight", async () => {
    // A submit that races the session check must fall back to the safe side.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<OrderRequestForm {...brandDelivered} />);

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Confirm brand delivery" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(saveOrderRequest).not.toHaveBeenCalled();
  });

  it("saves for a signed-in customer, sending ids rather than prices", async () => {
    mockSession(true);
    saveOrderRequest.mockResolvedValue({ saved: true, reference: "TOY-DAR-K7M4" });

    render(<OrderRequestForm {...brandDelivered} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Confirm brand delivery" }));

    await waitFor(() => expect(saveOrderRequest).toHaveBeenCalledTimes(1));

    const payload = saveOrderRequest.mock.calls[0][0];
    expect(payload.productId).toBe("toyota-corolla");
    // Normalised by the shared validator before it leaves the browser.
    expect(payload.phone).toBe("+255754123456");
    // Nothing with a price on it: the server re-derives all of that.
    expect(payload).not.toHaveProperty("lineTotalTZS");
    expect(payload).not.toHaveProperty("unitPriceTZS");
    expect(payload).not.toHaveProperty("product");
  });

  it("marks the browser's copy as saved so the confirmation can say so", async () => {
    mockSession(true);
    saveOrderRequest.mockResolvedValue({ saved: true, reference: "TOY-DAR-K7M4" });

    render(<OrderRequestForm {...brandDelivered} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Confirm brand delivery" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    const stored = parseOrderRequest(sessionStorage.getItem(ORDER_STORAGE_KEY));
    expect(stored?.savedToAccount).toBe(true);
  });

  it("still completes the order when saving fails", async () => {
    mockSession(true);
    saveOrderRequest.mockRejectedValue(new Error("Firestore unavailable"));

    render(<OrderRequestForm {...brandDelivered} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Confirm brand delivery" }));

    // The customer's request survives an outage at our end: they still reach
    // the confirmation screen with a reference they can quote.
    await waitFor(() => expect(push).toHaveBeenCalledWith("/order/confirmation"));
    const stored = parseOrderRequest(sessionStorage.getItem(ORDER_STORAGE_KEY));
    expect(stored?.reference).toBeTruthy();
    expect(stored?.savedToAccount).toBeUndefined();
  });
});
