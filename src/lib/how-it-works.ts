import { PROMISE } from "./promise";

/**
 * The words of the "How MalFleks works" page, as data.
 *
 * Data rather than JSX for the same reason `promise.ts` is: the page draws
 * these, the structured data for search engines repeats the questions and
 * answers word for word, and a test holds both to the same text.
 *
 * **Nothing here may say more than the site does.** Every answer restates
 * something the Terms commit to and the code carries out:
 *
 * - paying is by mobile money on ClickPesa's page, to MalFleks (`settle.ts`);
 * - the shop and the courier are paid after delivery (`payouts.ts`);
 * - an order the shop or MalFleks cancels is refunded in full;
 * - an unpaid order can be cancelled by the customer, a paid one is asked
 *   about (`customer-cancel.ts`);
 * - each shop delivers within its own city (`validateOrderRequest`).
 *
 * Left out on purpose, because they are not decided or not known: how long a
 * refund takes, how long a delivery takes for a shop that delivers itself,
 * what a customer who changes their mind after paying gets back, and which
 * mobile money networks are switched on -- the pay page shows those.
 */

export interface Step {
  title: string;
  body: string;
}

export const BUYER_STEPS: readonly Step[] = [
  {
    title: "Find what you want",
    body: "Search the shops in your city. Every product page shows which shop sells it, the price, and who will bring it to you.",
  },
  {
    title: "Order, and pay MalFleks",
    body: "Sign in, give your name, phone number and delivery address, and pay by mobile money. You pay MalFleks, never a seller's personal number.",
  },
  {
    title: "We hold your money",
    body: "The shop is told you have paid and gets your order ready. Your money stays with MalFleks while it is on its way.",
  },
  {
    title: "It arrives, then the shop is paid",
    body: "Once your order has been delivered, MalFleks pays the shop and the courier their shares. Not before.",
  },
];

export const SELLER_STEPS: readonly Step[] = [
  {
    title: "Apply",
    body: "Tell us about your shop. A person at MalFleks reads every application and emails you the answer.",
  },
  {
    title: "List your products",
    body: "Add each product with its price, a description and real photos. We check a listing before customers see it.",
  },
  {
    title: "Deliver what has been paid for",
    body: "You are told when a customer has paid. Deliver the order yourself, or through a courier in your city, and collect nothing at the door.",
  },
  {
    title: "Get paid after delivery",
    body: "When the order is marked delivered, MalFleks pays you your share. MalFleks keeps a service fee from each sale.",
  },
];

export const COURIER_STEPS: readonly Step[] = [
  {
    title: "Apply",
    body: "Tell us which city you work in. A person at MalFleks reads every application and emails you the answer.",
  },
  {
    title: "Carry paid orders",
    body: "When a shop in your city does not deliver itself, the customer chooses a courier. You see the order once it has been paid for.",
  },
  {
    title: "Collect nothing at the door",
    body: "The customer has already paid MalFleks. Deliver the order and mark it delivered.",
  },
  {
    title: "Get paid after delivery",
    body: "MalFleks pays you your share of the delivery fee once the order has been delivered.",
  },
];

export interface Question {
  question: string;
  answer: string;
  /** Where to go to act on the answer, when there is somewhere. */
  link?: { href: string; label: string };
}

export const QUESTIONS: readonly Question[] = [
  {
    question: "Is it safe to pay before my order arrives?",
    answer: `Yes. You pay MalFleks, not the seller. MalFleks holds your money and pays the shop only after your order has been delivered. If the shop cannot supply your order, it is cancelled and you get the full amount back. ${PROMISE.swahili}`,
  },
  {
    question: "How do I pay?",
    answer: "By mobile money. When you order, MalFleks opens a payment page run by ClickPesa, our payment provider, and you approve the payment on your phone. MalFleks never sees your mobile money PIN.",
  },
  {
    question: "Do I pay anything at the door?",
    answer: "No. The amount you see before you pay is the full amount, including delivery where a courier carries the order. If you paid through MalFleks, do not pay the shop or the courier again.",
  },
  {
    question: "What if the shop cannot supply my order?",
    answer: "The order is cancelled and you are refunded the full amount you paid. We email you when the refund has been sent.",
  },
  {
    question: "What if my order does not arrive?",
    answer: "Write to us with your order reference. The shop is paid only for an order that has been delivered, so your money is still with MalFleks while we sort it out.",
    link: { href: "/contact", label: "Contact MalFleks" },
  },
  {
    question: "Can I cancel an order?",
    answer: "An order you have not paid for, you can cancel yourself on Your orders; nothing is charged. If you have already paid, press “Ask to cancel” there as soon as you can. A person at MalFleks checks with the shop and emails you what happens to the order and your payment.",
    link: { href: "/account", label: "Your orders" },
  },
  {
    question: "Do I need an account?",
    answer: "Not to look around. To order you sign in with your Google account, so MalFleks can take your payment, keep your order and show you where the delivery is.",
  },
  {
    question: "Where does MalFleks deliver?",
    answer: "Each shop delivers within its own city, so you order from a shop in the city you are in. The order form asks which city your address is in before you pay.",
    link: { href: "/locator", label: "Find a shop near you" },
  },
  {
    question: "Does MalFleks sell the products?",
    answer: "No. The goods are sold by the shop, at the price the shop published. MalFleks holds no stock: it takes your payment, holds it, passes your order to the shop, and pays the shop after delivery.",
  },
  {
    question: "How do I sell or deliver through MalFleks?",
    answer: "Apply as a shop or as a courier. A person reads every application.",
    link: { href: "/apply", label: "Become a partner" },
  },
];
