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

// Every submission persists via these actions. Not under test here — that
// belongs to OrderRequestForm.auth.test.tsx — but they must be mocked so a
// jsdom render never reaches the real server actions' `next/headers` call.
vi.mock("@/app/actions/orders", () => ({
  submitOrder: vi.fn().mockResolvedValue({ ok: true, reference: "TOY-DAR-K7M4" }),
}));
vi.mock("@/app/actions/order-requests", () => ({
  saveOrderRequest: vi.fn().mockResolvedValue({ saved: false, reason: "unavailable" }),
}));

// This file is about the form itself -- fields, errors, the summary, what is
// stored for the confirmation screen -- so the customer is signed in
// throughout. What a signed-out customer gets instead (a trip to sign-in, and
// nothing sent) is OrderRequestForm.auth.test.tsx's subject.
vi.mock("@/components/auth/session-state", () => ({
  useSessionState: () => ({ signedIn: true, name: "Neema Mushi", picture: null }),
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

function fillDetails(phone = "0754123456", city?: string) {
  type("Full name", "Neema Mushi");
  type(/Phone number/, phone);
  if (city) type("Delivery city", city);
  type(/Delivery address/, "12 Sokoine Road, Arusha");
}

const SUBMIT = "Continue to payment";

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
    expect(screen.getByRole("button", { name: SUBMIT })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: SUBMIT })).toBeInTheDocument();
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

    fillDetails("12345", "Dar es Salaam");
    submit(SUBMIT);

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

    fillDetails("12345", "Dar es Salaam");
    submit(SUBMIT);
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

    fillDetails(undefined, "Arusha");
    submit(SUBMIT);

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText(/Select an agent to carry this order/)).toBeVisible();

    fireEvent.click(screen.getAllByRole("radio")[0]);
    submit(SUBMIT);

    // Submission now awaits the persist call before navigating.
    await waitFor(() => expect(push).toHaveBeenCalledWith("/order/confirmation"));
  });

  it("stores a request carrying the chosen agent through to confirmation", () => {
    renderForm(agentDelivered);

    fillDetails(undefined, "Arusha");
    type("Quantity", "2");
    fireEvent.click(screen.getAllByRole("radio")[0]);
    submit(SUBMIT);

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

    fillDetails(undefined, "Dar es Salaam");
    submit(SUBMIT);

    const stored = parseOrderRequest(sessionStorage.getItem(ORDER_STORAGE_KEY));
    expect(stored?.route.kind).toBe("brand");
    expect(stored?.route.carrier).toContain("Toyota");
    expect(stored?.route.agentId).toBeUndefined();
    expect(stored?.reference).toMatch(/^TOY-DAR-[A-Z0-9]{4}$/);
  });

  // Every delivery is within the shop's own city. Until 4 Oct 2026 nothing
  // asked, and an order for a Dodoma shop addressed to Kigoma went through.
  describe("delivery city", () => {
    it("will not continue until the customer says where it is going", () => {
      renderForm(brandDelivered);

      fillDetails();
      submit(SUBMIT);

      expect(push).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Delivery city")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText(/Say which city this is going to/)).toBeVisible();
    });

    it("refuses an order going somewhere the shop does not deliver, and points to the locator", () => {
      renderForm(brandDelivered);

      fillDetails(undefined, "elsewhere");
      // Said at once, before any submit: the customer should not fill in the
      // rest of a form that cannot be sent.
      expect(screen.getByRole("link", { name: "Find a shop in your city" })).toHaveAttribute("href", "/locator");

      submit(SUBMIT);
      expect(push).not.toHaveBeenCalled();
      expect(screen.getByText(/only delivers within Dar es Salaam/)).toBeVisible();
    });

    it("offers the shop's own city, and only that one", () => {
      renderForm(agentDelivered);

      const options = Array.from(screen.getByLabelText("Delivery city").querySelectorAll("option")).map((o) => o.textContent);
      expect(options).toEqual(["Choose…", "Arusha", "Somewhere else"]);
    });
  });
});
