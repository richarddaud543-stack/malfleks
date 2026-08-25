import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OrderCard from "./OrderCard";
import type { ListedOrder } from "@/server/orders/list-orders";

/**
 * The rule this file exists to hold, same as `ApplicationReviewCard.test.tsx`:
 * every state-changing action is two-step, a failed decision announces via
 * `role="alert"` rather than looking like nothing happened, and the actions
 * shown match the order's status exactly — a pending order never gets a
 * "Mark fulfilled" button, and a terminal order gets no actions at all.
 */

const confirmOrder = vi.fn();
const cancelOrder = vi.fn();
const markOrderFulfilled = vi.fn();
vi.mock("@/app/actions/orders", () => ({
  confirmOrder: (...args: unknown[]) => confirmOrder(...args),
  cancelOrder: (...args: unknown[]) => cancelOrder(...args),
  markOrderFulfilled: (...args: unknown[]) => markOrderFulfilled(...args),
}));

const ORDER: ListedOrder = {
  id: "order-1",
  status: "pending",
  reference: "TOY-DAR-K7M4",
  customerId: "uid-asha",
  customerFullName: "Asha Mwenda",
  customerPhone: "+255754123456",
  customerAddress: "Mikocheni B, near the Shell station",
  productName: "Toyota Corolla",
  quantity: 2,
  unitPriceTZS: 45_000_000,
  lineTotalTZS: 90_000_000,
  brandName: "Toyota",
  branchId: "toyota-dar",
  branchName: "Toyota Tanzania — Dar",
  branchCity: "Dar es Salaam",
  branchPhone: "+255222123456",
  routeKind: "brand",
  routeCarrier: "Toyota Tanzania",
  routeAgentPhone: null,
  routeEtaEstimate: null,
  decidedAt: null,
  decisionNote: null,
  requestedAt: new Date("2026-08-20").toISOString(),
  createdAt: new Date("2026-08-20").toISOString(),
};

function renderCard(order: ListedOrder = ORDER) {
  return render(<OrderCard order={order} />);
}

beforeEach(() => {
  confirmOrder.mockReset();
  cancelOrder.mockReset();
  markOrderFulfilled.mockReset();
  confirmOrder.mockResolvedValue({ ok: true });
  cancelOrder.mockResolvedValue({ ok: true });
  markOrderFulfilled.mockResolvedValue({ ok: true });
});

describe("OrderCard — pending order", () => {
  it("shows Confirm and Cancel, and nothing else", () => {
    renderCard();

    expect(
      screen.getByRole("button", { name: `Confirm ${ORDER.reference}` })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Cancel ${ORDER.reference}` })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /mark .* fulfilled/i })
    ).not.toBeInTheDocument();
  });

  it("does not confirm on the first click", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: `Confirm ${ORDER.reference}` }));

    expect(confirmOrder).not.toHaveBeenCalled();
    expect(screen.getByText(/is available at the quoted price/i)).toBeInTheDocument();
  });

  it("confirms once armed and confirmed again, by this order's id", async () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: `Confirm ${ORDER.reference}` }));
    fireEvent.click(screen.getByRole("button", { name: `Yes, confirm ${ORDER.reference}` }));

    await waitFor(() => expect(confirmOrder).toHaveBeenCalledWith(ORDER.id));
  });

  it("backs out without confirming", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: `Confirm ${ORDER.reference}` }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(confirmOrder).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: `Confirm ${ORDER.reference}` })
    ).toBeInTheDocument();
  });

  it("asks for a reason before cancelling, and requires one", async () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: `Cancel ${ORDER.reference}` }));

    expect(cancelOrder).not.toHaveBeenCalled();
    const confirmButton = screen.getByRole("button", {
      name: `Confirm cancellation of ${ORDER.reference}`,
    });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/why is this being cancelled/i), {
      target: { value: "Out of stock" },
    });
    expect(confirmButton).not.toBeDisabled();

    fireEvent.click(confirmButton);
    await waitFor(() =>
      expect(cancelOrder).toHaveBeenCalledWith(ORDER.id, "Out of stock")
    );
  });

  it("backs out of cancelling without cancelling", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: `Cancel ${ORDER.reference}` }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(cancelOrder).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: `Cancel ${ORDER.reference}` })
    ).toBeInTheDocument();
  });
});

describe("OrderCard — confirmed order", () => {
  const CONFIRMED: ListedOrder = { ...ORDER, status: "confirmed" };

  it("shows Mark fulfilled and Cancel, not Confirm", () => {
    renderCard(CONFIRMED);

    expect(
      screen.getByRole("button", { name: `Mark ${CONFIRMED.reference} fulfilled` })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Cancel ${CONFIRMED.reference}` })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `Confirm ${CONFIRMED.reference}` })
    ).not.toBeInTheDocument();
  });

  it("marks fulfilled once armed and confirmed", async () => {
    renderCard(CONFIRMED);

    fireEvent.click(
      screen.getByRole("button", { name: `Mark ${CONFIRMED.reference} fulfilled` })
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Yes, mark ${CONFIRMED.reference} fulfilled` })
    );

    await waitFor(() => expect(markOrderFulfilled).toHaveBeenCalledWith(CONFIRMED.id));
  });
});

describe("OrderCard — terminal orders show no actions", () => {
  it("fulfilled: no buttons at all", () => {
    renderCard({ ...ORDER, status: "fulfilled" });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("cancelled: no buttons, and shows the stored reason", () => {
    renderCard({
      ...ORDER,
      status: "cancelled",
      decisionNote: "Customer unreachable",
    });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Customer unreachable")).toBeInTheDocument();
  });
});

describe("OrderCard — a failed decision is never silent", () => {
  const cases: Array<{ reason: string | undefined; expect: RegExp }> = [
    { reason: "forbidden", expect: /no longer has admin access/i },
    { reason: "invalid-transition", expect: /someone already moved this order/i },
    { reason: "not-found", expect: /no longer exists/i },
    { reason: "unavailable", expect: /couldn't record the decision/i },
    { reason: undefined, expect: /couldn't record the decision/i },
  ];

  for (const { reason, expect: pattern } of cases) {
    it(`confirm: reason "${reason}" announces via role=alert and returns to idle`, async () => {
      confirmOrder.mockResolvedValue({ ok: false, reason });
      renderCard();

      fireEvent.click(screen.getByRole("button", { name: `Confirm ${ORDER.reference}` }));
      fireEvent.click(
        screen.getByRole("button", { name: `Yes, confirm ${ORDER.reference}` })
      );

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(pattern);
      expect(
        screen.getByRole("button", { name: `Confirm ${ORDER.reference}` })
      ).toBeInTheDocument();
    });
  }

  it("does not show a stale error after a fresh attempt is made", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: `Confirm ${ORDER.reference}` }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
