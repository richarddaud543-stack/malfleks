import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import CancelOrderButton from "./CancelOrderButton";

const cancelOwnOrderAction = vi.fn();
vi.mock("@/app/actions/customer-orders", () => ({
  cancelOwnOrderAction: (...args: unknown[]) => cancelOwnOrderAction(...args),
}));

/**
 * The words matter here more than the mechanics. "Cancel" on an unpaid order
 * really cancels it; on a paid one nothing is cancelled until a person at
 * MalFleks decides, and the button must not say otherwise.
 */
describe("CancelOrderButton", () => {
  beforeEach(() => {
    cancelOwnOrderAction.mockReset();
  });

  it("asks before cancelling, and can be backed out of without calling anything", () => {
    render(<CancelOrderButton reference="ORA-DOD-TEST" paid={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel order ORA-DOD-TEST" }));
    expect(screen.getByText(/You have not been charged for it/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.getByRole("button", { name: "Cancel order ORA-DOD-TEST" })).toBeVisible();
    expect(cancelOwnOrderAction).not.toHaveBeenCalled();
  });

  it("cancels an unpaid order by its reference", async () => {
    cancelOwnOrderAction.mockResolvedValue({ ok: true, kind: "cancelled" });
    render(<CancelOrderButton reference="ORA-DOD-TEST" paid={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel order ORA-DOD-TEST" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel order ORA-DOD-TEST" }));

    await waitFor(() => expect(cancelOwnOrderAction).toHaveBeenCalledWith("ORA-DOD-TEST"));
  });

  it("on a paid order says “Ask”, and afterwards says plainly that nothing is cancelled yet", async () => {
    cancelOwnOrderAction.mockResolvedValue({ ok: true, kind: "requested" });
    render(<CancelOrderButton reference="ORA-DOD-TEST" paid />);

    expect(screen.queryByRole("button", { name: /^Cancel order/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ask to cancel order ORA-DOD-TEST" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, ask to cancel order ORA-DOD-TEST" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/Nothing is cancelled yet/);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says so when the payment landed first and the order was only asked about", async () => {
    // Drawn as unpaid, paid by the time it was pressed: the server asks instead of cancelling.
    cancelOwnOrderAction.mockResolvedValue({ ok: true, kind: "requested" });
    render(<CancelOrderButton reference="ORA-DOD-TEST" paid={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel order ORA-DOD-TEST" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel order ORA-DOD-TEST" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/Nothing is cancelled yet/);
  });

  it.each([
    ["too-late", /has changed since the page loaded/],
    ["already-asked", /already asked us/],
    ["signed-out", /session has expired/],
    ["unavailable", /Nothing was changed/],
  ])("explains a refusal (%s) and offers the button again", async (reason, message) => {
    cancelOwnOrderAction.mockResolvedValue({ ok: false, reason });
    render(<CancelOrderButton reference="ORA-DOD-TEST" paid={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel order ORA-DOD-TEST" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel order ORA-DOD-TEST" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Cancel order ORA-DOD-TEST" })).toBeVisible();
  });
});
