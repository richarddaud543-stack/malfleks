import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { getBranchById, getBrandById, getProductById } from "@/data";
import type { Branch, Brand, Product } from "@/data";
import { formatEta, formatTZS } from "@/lib/format";
import {
  ORDER_STORAGE_KEY,
  parseOrderRequest,
  resolveDeliveryRoute,
} from "@/lib/order";
import OrderRequestForm from "./OrderRequestForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// Every submission now persists via this action. Not under test here — that
// belongs to OrderRequestForm.auth.test.tsx — but it must be mocked so a
// jsdom render never reaches the real server action's `next/headers` call.
vi.mock("@/app/actions/orders", () => ({
  submitOrder: vi.fn().mockResolvedValue({ ok: true, reference: "TOY-DAR-K7M4" }),
}));

function fixture(productId: string) {
  const product = getProductById(productId) as Product;
  const brand = getBrandById(product.brandId) as Brand;
  const branch = getBranchById(product.branchId) as Branch;
  return { product, brand, branch, route: resolveDeliveryRoute(branch) };
}

// toyota-corolla sits at a branch that delivers; toyota-hilux at one that does not.
const brandDelivered = fixture("toyota-corolla");
const agentDelivered = fixture("toyota-hilux");

function renderForm(f: ReturnType<typeof fixture>) {
  return render(<OrderRequestForm {...f} />);
}

function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillDetails(phone = "0754123456") {
  type("Full name", "Neema Mushi");
  type(/Phone number/, phone);
  type(/Delivery address/, "12 Sokoine Road, Arusha");
}

function submit(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("OrderRequestForm", () => {
  beforeEach(() => {
    push.mockClear();
    sessionStorage.clear();
  });

  it("offers no courier choice when the brand delivers", () => {
    renderForm(brandDelivered);

    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Confirm brand delivery" })
    ).toBeInTheDocument();
    // The summary names the brand's own fleet as the carrier.
    expect(screen.getByText("Toyota own fleet")).toBeVisible();
  });

  it("lists the agents serving the branch's city when it does not deliver", () => {
    renderForm(agentDelivered);

    const labels = screen
      .getAllByRole("radio")
      .map((radio) => radio.closest("label")?.textContent ?? "")
      .join(" ");
    expect(labels).toContain("Arusha Swift Couriers");
    expect(labels).toContain("Fargo Courier");
    expect(labels).not.toContain("Mwanza Express Riders");
    expect(
      screen.getByRole("button", { name: "Confirm agent delivery" })
    ).toBeInTheDocument();
  });

  it("updates the line total as the quantity changes", () => {
    renderForm(brandDelivered);

    // Compared as raw text: formatTZS emits non-breaking spaces that
    // toHaveTextContent would normalize away on only one side.
    const total = screen.getByTestId("order-line-total");
    expect(total.textContent).toBe(formatTZS(brandDelivered.product.priceTZS));

    type("Quantity", "3");
    expect(total.textContent).toBe(
      formatTZS(brandDelivered.product.priceTZS * 3)
    );

    // Mid-edit values show a placeholder rather than a misleading total.
    type("Quantity", "");
    expect(total.textContent).toBe("—");
  });

  it("names the chosen agent in the summary once one is picked", () => {
    renderForm(agentDelivered);

    expect(screen.getByText("Not chosen yet")).toBeVisible();
    fireEvent.click(screen.getAllByRole("radio")[0]);

    const chosen = agentDelivered.route.agents[0];
    expect(
      screen.getByText(new RegExp(`${chosen.name} · ${formatEta(chosen.eta)}`))
    ).toBeVisible();
  });

  it("shows an inline, announced error for an implausible phone number", () => {
    renderForm(brandDelivered);

    fillDetails("12345");
    submit("Confirm brand delivery");

    const phone = screen.getByLabelText(/Phone number/);
    expect(phone).toHaveAttribute("aria-invalid", "true");

    // The message must be reachable from the field, not just on the page.
    const messages = (phone.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(messages).toMatch(/Tanzanian mobile/);

    expect(screen.getByRole("alert")).toHaveTextContent(/1 detail needs/);
    expect(push).not.toHaveBeenCalled();
  });

  it("clears an error as soon as the customer fixes it", () => {
    renderForm(brandDelivered);

    fillDetails("12345");
    submit("Confirm brand delivery");
    expect(screen.getByLabelText(/Phone number/)).toHaveAttribute(
      "aria-invalid",
      "true"
    );

    type(/Phone number/, "0754 123 456");
    expect(screen.getByLabelText(/Phone number/)).not.toHaveAttribute(
      "aria-invalid"
    );
  });

  it("refuses to send an agent-routed order until an agent is chosen", async () => {
    renderForm(agentDelivered);

    fillDetails();
    submit("Confirm agent delivery");

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText(/Select an agent to carry this order/)).toBeVisible();

    fireEvent.click(screen.getAllByRole("radio")[0]);
    submit("Confirm agent delivery");

    // Submission now awaits the persist call before navigating.
    await waitFor(() => expect(push).toHaveBeenCalledWith("/order/confirmation"));
  });

  it("stores a request carrying the chosen agent through to confirmation", () => {
    renderForm(agentDelivered);

    fillDetails();
    type("Quantity", "2");
    fireEvent.click(screen.getAllByRole("radio")[0]);
    submit("Confirm agent delivery");

    const stored = parseOrderRequest(sessionStorage.getItem(ORDER_STORAGE_KEY));
    expect(stored).not.toBeNull();
    expect(stored?.route.kind).toBe("agent");
    expect(stored?.route.carrier).toBe(agentDelivered.route.agents[0].name);
    expect(stored?.quantity).toBe(2);
    expect(stored?.lineTotalTZS).toBe(agentDelivered.product.priceTZS * 2);
    expect(stored?.customer.phone).toBe("+255754123456");
    expect(stored?.branch.id).toBe("toyota-arusha");
  });

  it("addresses a brand-delivered request to the brand's own fleet", () => {
    renderForm(brandDelivered);

    fillDetails();
    submit("Confirm brand delivery");

    const stored = parseOrderRequest(sessionStorage.getItem(ORDER_STORAGE_KEY));
    expect(stored?.route.kind).toBe("brand");
    expect(stored?.route.carrier).toContain("Toyota");
    expect(stored?.route.agentId).toBeUndefined();
    expect(stored?.reference).toMatch(/^TOY-DAR-[A-Z0-9]{4}$/);
  });
});
