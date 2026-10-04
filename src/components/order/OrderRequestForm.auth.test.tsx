import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getBranchById, getBrandById, getProductById } from "@/data";
import type { Branch, Brand, Product } from "@/data";
import { ORDER_STORAGE_KEY, parseOrderRequest, resolveDeliveryRoute } from "@/lib/order";
import { invalidateSessionState } from "@/components/auth/session-state";
import OrderRequestForm, { orderDraftKey } from "./OrderRequestForm";

/**
 * One rule, and it has now been reversed twice.
 *
 * **A signed-out customer's request is transmitted nowhere.** Neither
 * `submitOrder` (MalFleks's own record) nor `saveOrderRequest` (the customer's
 * saved copy) may fire without a session. Not "fires and is refused" —
 * does not fire, because an action that declines to write has still received
 * the name, phone number and address over the wire.
 *
 * The history is worth keeping, because the second reversal was not a change
 * of mind so much as a discovery. The rule above was the original promise.
 * It was then deliberately dropped so that every request got a queryable
 * record, and this file was rewritten to prove the opposite. Nobody updated
 * the confirmation screen, which went on telling people their details had
 * gone nowhere while the server wrote them to Postgres — and `e2e/auth.spec.ts`
 * had been failing on exactly that the whole time, unnoticed, because CI had
 * never run. It ran for the first time on 2026-08-29 and said so immediately.
 *
 * The owner's call, that day: the promise wins. Nothing is dispatched to a
 * branch either way, so the stored row bought an admin view of orders nobody
 * acts on, in exchange for holding a stranger's home address with no retention
 * policy.
 *
 * **4 Oct 2026 -- what a signed-out submit does instead.** It used to save a
 * "request" in the browser and show a confirmation screen with a reference no
 * shop had ever received and that could not be paid for. Since paying became
 * part of ordering, that was a dead end behind a button that said "Confirm".
 * Now the button says "Sign in to order", the typed details are kept in the
 * tab, and the customer is sent to sign in and straight back. The rule at the
 * top is untouched: nothing is transmitted.
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
  fireEvent.change(screen.getByLabelText("Delivery city"), {
    target: { value: "Dar es Salaam" },
  });
  fireEvent.change(screen.getByLabelText(/Delivery address/), {
    target: { value: "12 Sokoine Road, Arusha" },
  });
}

const SIGN_IN_FIRST = "/sign-in?next=%2Fdelivery%2Ftoyota-corolla";

describe("OrderRequestForm and the customer's session", () => {
  beforeEach(() => {
  submitOrder.mockResolvedValue({ ok: true, reference: "TOY-DAR-TEST", payNow: false });
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

  // The load-bearing one, and the unit-level twin of `e2e/auth.spec.ts`'s
  // "an order request transmits nothing".
  it("sends nothing anywhere when the customer is signed out", async () => {
    mockSession(false);
    render(<OrderRequestForm {...brandDelivered} />);
    // Let the session answer land, so this is a real signed-out state rather
    // than an unresolved one that happens to behave the same way.
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to order" }));

    // To sign in, and back to this same form afterwards.
    await waitFor(() => expect(push).toHaveBeenCalledWith(SIGN_IN_FIRST));

    // Neither server action. Not MalFleks's record, not the customer's copy.
    expect(submitOrder).not.toHaveBeenCalled();
    expect(saveOrderRequest).not.toHaveBeenCalled();

    // No order exists, so there is no request for a confirmation screen to
    // show -- only what was typed, kept in this tab for the trip back.
    expect(sessionStorage.getItem(ORDER_STORAGE_KEY)).toBeNull();
    const draft = JSON.parse(sessionStorage.getItem(orderDraftKey("toyota-corolla")) ?? "null");
    expect(draft).toMatchObject({ fullName: "Neema Mushi", phone: "0754123456", deliveryCity: "Dar es Salaam" });
  });

  it("does not send a signed-out customer to sign in with a form that is still wrong", async () => {
    mockSession(false);
    render(<OrderRequestForm {...brandDelivered} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Sign in to order" }));

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/details need fixing/);
  });

  it("puts back what was typed when the customer returns from signing in, and clears it once ordered", async () => {
    sessionStorage.setItem(
      orderDraftKey("toyota-corolla"),
      JSON.stringify({ quantity: "3", fullName: "Neema Mushi", phone: "0754123456", address: "12 Sokoine Road", agentId: null, deliveryCity: "Dar es Salaam" }),
    );
    mockSession(true);
    submitOrder.mockResolvedValue({ ok: true, reference: "TOY-DAR-PAY1", payNow: true });
    saveOrderRequest.mockResolvedValue({ saved: true });
    render(<OrderRequestForm {...brandDelivered} />);

    await waitFor(() => expect(screen.getByLabelText("Full name")).toHaveValue("Neema Mushi"));
    expect(screen.getByLabelText("Quantity")).toHaveValue(3);
    expect(screen.getByLabelText("Delivery city")).toHaveValue("Dar es Salaam");

    // Nothing to retype: straight on to payment.
    fireEvent.click(await screen.findByRole("button", { name: "Continue to payment" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pay/TOY-DAR-PAY1"));
    expect(submitOrder.mock.calls[0][0]).toMatchObject({ quantity: "3", deliveryCity: "Dar es Salaam" });
    expect(sessionStorage.getItem(orderDraftKey("toyota-corolla"))).toBeNull();
  });

  it("ignores a kept draft that is not what the form wrote", async () => {
    sessionStorage.setItem(orderDraftKey("toyota-corolla"), "{not json");
    mockSession(true);
    render(<OrderRequestForm {...brandDelivered} />);
    await screen.findByRole("button", { name: "Continue to payment" });

    expect(screen.getByLabelText("Full name")).toHaveValue("");
    expect(screen.getByLabelText("Quantity")).toHaveValue(1);
  });

  it("sends nothing while the session answer is still outstanding", async () => {
    // A submit that races the session check must fail closed. An unresolved
    // session is not a signed-in one, and the cost of guessing wrong in that
    // direction is a stranger's home address in the database.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<OrderRequestForm {...brandDelivered} />);

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to order" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(SIGN_IN_FIRST));
    expect(submitOrder).not.toHaveBeenCalled();
    expect(saveOrderRequest).not.toHaveBeenCalled();
  });

  it("sends the order, without prices, once the customer is signed in", async () => {
    mockSession(true);
    saveOrderRequest.mockResolvedValue({ saved: true, reference: "TOY-DAR-K7M4" });
    render(<OrderRequestForm {...brandDelivered} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));

    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(1));
    const payload = submitOrder.mock.calls[0][0];
    expect(payload.productId).toBe("toyota-corolla");
    // Normalised by the shared validator before it leaves the browser.
    expect(payload.phone).toBe("+255754123456");
    // Where it is going, as the customer picked it: the server refuses a
    // request without it and holds it to the branch's own city.
    expect(payload.deliveryCity).toBe("Dar es Salaam");
    // Nothing with a price on it: the server re-derives all of that, so a
    // hand-crafted payload cannot misstate what was ordered.
    expect(payload).not.toHaveProperty("lineTotalTZS");
    expect(payload).not.toHaveProperty("unitPriceTZS");
    expect(payload).not.toHaveProperty("product");
  });

  it("persists the order and also saves to account for a signed-in customer", async () => {
    mockSession(true);
    saveOrderRequest.mockResolvedValue({ saved: true, reference: "TOY-DAR-K7M4" });

    render(<OrderRequestForm {...brandDelivered} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));

    // The customer's request survives an outage at our end: they still reach
    // the confirmation screen with a reference they can quote.
    await waitFor(() => expect(push).toHaveBeenCalledWith("/order/confirmation"));
    const stored = parseOrderRequest(sessionStorage.getItem(ORDER_STORAGE_KEY));
    expect(stored?.reference).toBeTruthy();
    expect(stored?.savedToAccount).toBeUndefined();
  });

  it("still completes the order when persistence itself fails", async () => {
    mockSession(true);
    submitOrder.mockRejectedValue(new Error("Prisma unavailable"));
    saveOrderRequest.mockResolvedValue({ saved: false, reason: "unavailable" });

    render(<OrderRequestForm {...brandDelivered} />);

    fill();
    fireEvent.click(await screen.findByRole("button", { name: "Continue to payment" }));

    // A failed write costs the customer nothing they had a moment ago: the
    // browser copy is already there, and they still reach the confirmation
    // screen with a reference to quote.
    await waitFor(() => expect(push).toHaveBeenCalledWith("/order/confirmation"));
    const stored = parseOrderRequest(sessionStorage.getItem(ORDER_STORAGE_KEY));
    expect(stored?.reference).toBeTruthy();
  });

  // The owner's call, 3 Oct 2026: order, pay, done. No confirmation screen in
  // between, and no waiting for anyone.
  it("takes a signed-in customer straight to the pay page when the checkout opened", async () => {
    mockSession(true);
    submitOrder.mockResolvedValue({ ok: true, reference: "TOY-DAR-PAY1", payNow: true });
    saveOrderRequest.mockResolvedValue({ saved: true });
    render(<OrderRequestForm {...brandDelivered} />);
    await screen.findByRole("button", { name: "Continue to payment" });

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/pay/TOY-DAR-PAY1"));
    expect(push).not.toHaveBeenCalledWith("/order/confirmation");
  });

  it("falls back to the confirmation screen when no checkout could be opened", async () => {
    mockSession(true);
    submitOrder.mockResolvedValue({ ok: true, reference: "TOY-DAR-WAIT", payNow: false });
    saveOrderRequest.mockResolvedValue({ saved: true });
    render(<OrderRequestForm {...brandDelivered} />);
    await screen.findByRole("button", { name: "Continue to payment" });

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/order/confirmation"));
  });
});
