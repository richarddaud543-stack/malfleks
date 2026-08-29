import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DeleteSavedRequest from "./DeleteSavedRequest";

/**
 * The rule this file exists to hold: **a customer can take their own details
 * back out, and cannot do it by accident.**
 *
 * Debt #20 was that the save path had no counterpart — name, phone and home
 * address went into storage and there was no way to remove them. The risk in
 * fixing it is the opposite one, so both directions are tested: the first click
 * must not delete anything, and the second must.
 */

const deleteOrderRequest = vi.fn();
vi.mock("@/app/actions/order-requests", () => ({
  deleteOrderRequest: (...args: unknown[]) => deleteOrderRequest(...args),
}));

const ID = "aBcDeFgHiJkLmNoPqRsT";
const REFERENCE = "TOY-DAR-K7M4";

const removeButton = () => screen.getByRole("button", { name: /^Remove request/ });
const confirmButton = () =>
  screen.getByRole("button", { name: /^Yes, permanently remove/ });

function renderControl() {
  return render(<DeleteSavedRequest id={ID} reference={REFERENCE} />);
}

beforeEach(() => {
  deleteOrderRequest.mockReset();
  deleteOrderRequest.mockResolvedValue({ deleted: true });
});

describe("DeleteSavedRequest", () => {
  it("does not delete on the first click", async () => {
    renderControl();

    fireEvent.click(removeButton());

    expect(deleteOrderRequest).not.toHaveBeenCalled();
    expect(
      screen.getByText("Remove this request permanently?")
    ).toBeInTheDocument();
  });

  it("deletes once confirmed, and says which request it is removing", async () => {
    renderControl();

    // The accessible name carries the reference: every card in the list would
    // otherwise expose an identical "Remove" to anyone navigating by control.
    fireEvent.click(screen.getByRole("button", { name: `Remove request ${REFERENCE}` }));
    fireEvent.click(
      screen.getByRole("button", {
        name: `Yes, permanently remove request ${REFERENCE}`,
      })
    );

    await waitFor(() => expect(deleteOrderRequest).toHaveBeenCalledWith(ID));
  });

  it("backs out without deleting when the customer keeps it", async () => {
    renderControl();

    fireEvent.click(removeButton());
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));

    expect(deleteOrderRequest).not.toHaveBeenCalled();
    expect(removeButton()).toBeInTheDocument();
  });

  it("uses real buttons, so the keyboard gets it for free", () => {
    // The regression worth guarding is a div with an onClick, which looks
    // identical and is unreachable by keyboard. Asserting the element type is
    // honest about what is being checked; simulating Enter on a native button
    // in jsdom would only prove jsdom dispatches events.
    renderControl();
    expect(removeButton().tagName).toBe("BUTTON");

    fireEvent.click(removeButton());
    expect(confirmButton().tagName).toBe("BUTTON");
    expect(screen.getByRole("button", { name: "Keep it" }).tagName).toBe("BUTTON");
  });

  it("announces a failure instead of pretending the details are gone", async () => {
    // The failure mode that matters: the customer asked for their address to be
    // removed and it was not. Silence here reads as success.
    deleteOrderRequest.mockResolvedValue({
      deleted: false,
      reason: "unavailable",
    });
    renderControl();

    fireEvent.click(removeButton());
    fireEvent.click(confirmButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't remove this request/i);
    // And it disarms, so a stray second Enter does not retry blindly.
    expect(removeButton()).toBeInTheDocument();
  });

  it("tells a customer whose session expired what to do about it", async () => {
    deleteOrderRequest.mockResolvedValue({
      deleted: false,
      reason: "signed-out",
    });
    renderControl();

    fireEvent.click(removeButton());
    fireEvent.click(confirmButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(/sign in again/i);
  });
});
