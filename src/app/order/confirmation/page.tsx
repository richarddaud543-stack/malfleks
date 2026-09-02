import type { Metadata } from "next";
import OrderConfirmation from "@/components/order/OrderConfirmation";

export const metadata: Metadata = {
  title: "Order request received",
  description:
    "Your order request reference and what happens next — MalFleks does not take payment.",
  // Nothing here is addressable: the request lives in one browser tab only.
  robots: { index: false, follow: true },
};

export default function OrderConfirmationPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <OrderConfirmation />
    </div>
  );
}
