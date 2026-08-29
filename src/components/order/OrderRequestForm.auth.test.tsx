import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getBranchById, getBrandById, getProductById } from "@/data";
import type { Branch, Brand, Product } from "@/data";
import { ORDER_STORAGE_KEY, parseOrderRequest, resolveDeliveryRoute } from "@/lib/order";
import { invalidateSessionState } from "@/components/auth/session-state";
import OrderRequestForm from "./OrderRequestForm";

/**
 * The rules this file exists to hold — one of them reversed by the owner's
 * decision to persist every order request, and this file changed with it:
 *
 * - **Every order request is persisted, signed in or not.** `submitOrder`
 *   fires on every successful submission regardless of session state. This
 *   file used to prove the opposite ("a signed-out customer's request is
 *   transmitted nowhere"); it now proves persistence happens for everyone.
 * - **Saving a copy to the customer's account stays gated on being signed
 *   in.** That is `saveOrderRequest` — a separate, additional convenience
 *   (the customer's own saved copy) — and it must never fire for a signed-out
 *   customer. The
 *   confirmation screen still promises that one specifically.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const saveOrderRequest = vi.fn();
vi.mock("@/app/actions/order-requests", () => ({
  saveOrderRequest: (...args: unknown[]) => saveOrderRequest(...args),
}));

const submitOrder = vi.fn();
vi.mock("@/app/actions/orders", () => ({
  submitOrder: (...args: unknown[]) => submitOrder(...args),
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
    submitOrder.mockReset();
    submitOrder.mockResolvedValue({ ok: true, reference: "TOY-DAR-K7M4" });
    sessionStorage.clear();
    invalidateSessionState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists the order via submitOrder even when signed out", async () => {
    mockSession(false);
    render(<OrderRequestForm {...brandDelivered} />);
    // Let the session answer land, so this is a real signed-out state rather
    // than an unresolved one that happens to behave the same way.
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Confirm brand delivery" }));

    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(1));
    const payload = submitOrder.mock.calls[0][0];
    expect(payload.productId).toBe("toyota-corolla");
    // Normalised by the shared validator before it leaves the browser.
    expect(payload.phone).toBe("+255754123456");
    // Nothing with a price on it: the server re-derives all of that.
    expect(payload).not.toHaveProperty("lineTotalTZS");
    expect(payload).not.toHaveProperty("unitPriceTZS");
    expect(payload).not.toHaveProperty("product");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/order/confirmation"));
    // The account-save path stays gated: a signed-out customer's name, phone
    // and address are never sent there.
    expect(saveOrderRequest).not.toHaveBeenCalled();

    const stored = parseOrderRequest(sessionStorage.getItem(ORDER_STORAGE_KEY));
    expect(stored?.customer.fullName).toBe("Neema Mushi");
    expect(stored?.savedToAccount).toBeUndefined();
  });

  it("persists the order without waiting on the session answer", async () => {
    // A submit that races the session check must still reach the backend:
    // persistence does not depend on the client's own read of who is signed
    // in — only the account-save path below does.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<OrderRequestForm {...brandDelivered} />);

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Confirm brand delivery" }));

    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(saveOrderRequest).not.toHaveBeenCalled();
  });

  it("persists the order and also saves to account for a signed-in customer", async () => {
    mockSession(true);
    saveOrderRequest.mockResolvedValue({ saved: true, reference: "TOY-DAR-K7M4" });

    render(<OrderRequestForm {...brandDelivered} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Confirm brand delivery" }));

    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(saveOrderRequest).toHaveBeenCalledTimes(1));

    const payload = saveOrderRequest.mock.calls[0][0];
    expect(payload.productId).toBe("toyota-corolla");
    expect(payload.phone).toBe("+255754123456");
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

  it("still completes the order when the account save fails", async () => {
    mockSession(true);
    saveOrderRequest.mockRejectedValue(new Error("database unavailable"));

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

  it("still completes the order when persistence itself fails", async () => {
    mockSession(false);
    submitOrder.mockRejectedValue(new Error("Prisma unavailable"));

    render(<OrderRequestForm {...brandDelivered} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Confirm brand delivery" }));

    // A failed write costs the customer nothing they had a moment ago: the
    // browser copy is already there, and they still reach the confirmation
    // screen with a reference to quote.
    await waitFor(() => expect(push).toHaveBeenCalledWith("/order/confirmation"));
    const stored = parseOrderRequest(sessionStorage.getItem(ORDER_STORAGE_KEY));
    expect(stored?.reference).toBeTruthy();
  });
});
