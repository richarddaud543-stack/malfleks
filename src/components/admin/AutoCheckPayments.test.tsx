import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import AutoCheckPayments from "./AutoCheckPayments";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const autoCheckPaymentsAction = vi.fn();
vi.mock("@/app/actions/reconcile", () => ({
  autoCheckPaymentsAction: (...args: unknown[]) => autoCheckPaymentsAction(...args),
}));

/**
 * The check with ClickPesa used to run while the Money page was being
 * rendered, so Next.js prefetching the page from the sidebar spent API calls
 * on every admin page view. It now runs here, once the page is on screen.
 */
describe("AutoCheckPayments", () => {
  beforeEach(() => {
    refresh.mockClear();
    autoCheckPaymentsAction.mockReset();
  });

  it("asks once when the page appears, and redraws when something was checked", async () => {
    autoCheckPaymentsAction.mockResolvedValue({ changed: true });
    const { rerender } = render(<AutoCheckPayments />);
    rerender(<AutoCheckPayments />);

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(autoCheckPaymentsAction).toHaveBeenCalledTimes(1);
  });

  it("leaves the page alone when nothing was due", async () => {
    autoCheckPaymentsAction.mockResolvedValue({ changed: false });
    render(<AutoCheckPayments />);

    await waitFor(() => expect(autoCheckPaymentsAction).toHaveBeenCalledTimes(1));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stays quiet when the check itself fails", async () => {
    autoCheckPaymentsAction.mockRejectedValue(new Error("network"));
    const { container } = render(<AutoCheckPayments />);

    await waitFor(() => expect(autoCheckPaymentsAction).toHaveBeenCalledTimes(1));
    expect(refresh).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
