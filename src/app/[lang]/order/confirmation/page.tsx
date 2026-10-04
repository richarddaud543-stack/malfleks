import { ORDER } from "@/i18n/copy/order";
import { pageLocale } from "@/i18n/server";
import type { Metadata } from "next";
import OrderConfirmation from "@/components/order/OrderConfirmation";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const copy = ORDER[await pageLocale(params)].confirmation;
  return { title: copy.title, description: copy.description, robots: { index: false, follow: true } };
}

export default async function OrderConfirmationPage({ params }: Props) {
  await pageLocale(params);
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <OrderConfirmation />
    </div>
  );
}
