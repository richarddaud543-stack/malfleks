import TermsSw from "@/components/legal/TermsSw";
import { localeAlternates } from "@/i18n/locale";
import { pageLocale } from "@/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";

import ScrollReveal from "@/components/motion/ScrollReveal";
import BusinessDetails from "@/components/legal/BusinessDetails";
import { MALFLEKS_CONTACT_EMAIL } from "@/lib/contact";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  return {
    title: locale === "sw" ? "Masharti ya matumizi" : "Terms of use",
    description:
      locale === "sw"
        ? "MalFleks inafanya nini: tunaorodhesha matawi, tunapeleka oda yako kwao, na tunashikilia malipo ya oda iliyothibitishwa mpaka ifike. Hatuna bidhaa."
        : "What MalFleks does: we list branches, pass your order to them, and hold your payment for a confirmed order until it is delivered. We hold no stock.",
    alternates: localeAlternates(locale, "/terms"),
  };
}

/**
 * Terms of use.
 *
 * Written to describe **what this site actually does**. Since 2 Oct 2026 that
 * includes money: a signed-in customer pays MalFleks for a confirmed order and
 * MalFleks holds it until delivery (the owner's decision; see
 * `src/server/orders/checkout.ts`). The "Paying" section says so plainly,
 * because terms that still claimed "we take no payment" would be the
 * document's own first lie.
 *
 * **Not legal advice and not drafted by a lawyer.** The earlier version of this
 * comment said that if MalFleks started holding money this document had to be
 * rewritten by someone qualified first. That has not happened: what is here is
 * an accurate plain-language description, written so the page is not false,
 * and it still needs that review. In particular the refund paragraph states
 * only what is certain (an order we or the branch cancel is refunded in full);
 * what a customer gets if *they* cancel is an open decision, and the page says
 * to contact us rather than inventing a rule.
 */
export default async function TermsPage({ params }: Props) {
  // The Swahili page is a translation; the English below is the text that decides.
  if ((await pageLocale(params)) === "sw") return <TermsSw />;

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <ScrollReveal>
        <p className="font-accent-serif text-xl italic text-accent">MalFleks</p>
        <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
          Terms of use
        </h1>
        <p className="mt-3 text-sm text-muted">Last updated 12 October 2026.</p>
      </ScrollReveal>

      <div className="prose-malfleks mt-10 space-y-8 text-sm leading-relaxed text-muted">
        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            What MalFleks is
          </h2>
          <p className="mt-2">
            MalFleks lists shops and branches in Tanzania and shows what each one
            sells, where it is, and how the goods would reach you — the
            branch&apos;s own delivery or a local courier. When you send an
            order request, MalFleks passes your name, phone number and delivery
            address to that branch, and gives you a reference number to quote.
          </p>
          <p className="mt-2">
            MalFleks is <strong>not the seller</strong> and holds no stock. The
            goods are sold by the branch, at the price the branch published. If
            a branch does not have what it listed, or the price has changed, we
            want to hear about it, because a branch that keeps doing it does
            not belong here.
          </p>
          <p className="mt-2">
            An order is placed with the branch once you have paid for it on
            MalFleks. Until then nothing is reserved and nothing is owed.
          </p>
        </section>

        {/* Electronic Transactions Act 2015, s.28(1)(a)-(b). */}
        <section id="who-we-are" className="scroll-mt-28">
          <h2 className="font-display text-lg font-medium text-foreground">
            Who we are
          </h2>
          <p className="mt-2">
            These are MalFleks&apos;s own details, as the Electronic Transactions
            Act, 2015 asks an online business to publish them. Each branch&apos;s
            name and location are on its page and on your order.
          </p>
          <BusinessDetails locale="en" className="mt-4" />
        </section>

        {/* `id` so the footer's "Paying, delivery and refunds" link lands here. */}
        <section id="paying" className="scroll-mt-28">
          <h2 className="font-display text-lg font-medium text-foreground">
            Paying
          </h2>
          <p className="mt-2">
            When you place an order while signed in, a checkout page opens for
            it on MalFleks straight away. You pay the full amount shown there
            — the goods and, where a courier is used, the delivery fee — by
            mobile money through ClickPesa, our payment provider. Your order is
            placed with the branch once you have paid; an order you do not pay
            for is not sent to the branch and nothing is owed on it. Where an
            order cannot be priced when you place it, the branch confirms it
            first and the checkout opens after that.
          </p>
          <p className="mt-2">
            <strong>You pay MalFleks, and MalFleks holds your payment</strong>{" "}
            until the order is delivered. We then pay the branch and the courier
            their shares and keep a service fee, which is already included in
            the amount you were shown: you are not charged anything on top of it.
            If you paid through MalFleks, do not pay the branch or the courier
            again at the door.
          </p>
          <p className="mt-2">
            <strong>Your delivery code.</strong> When you pay, you are given a
            six-digit delivery code: on your order page, in your receipt and,
            where we can, by text message. Give it to the person who brings
            your order only once the goods are in your hands. Entering that
            code is what records the order as delivered and releases your
            payment to the branch and the courier, so do not share it before
            then, and nobody from MalFleks will ask you for it. If a delivery
            cannot be confirmed with the code, MalFleks checks with you before
            anyone is paid.
          </p>
          <p className="mt-2">
            If the branch or MalFleks cancels an order you have paid for — for
            example because the branch turns out not to have the item — you are
            refunded the full amount. If an order you paid for has not been
            delivered within 30 days of your payment, you may cancel it and you
            are refunded in full, whatever the reason; a late order is usually
            cancelled and refunded long before that.
          </p>
          <p className="mt-2">
            You can cancel an order you have not paid for yourself, on{" "}
            <Link
              href="/account"
              className="text-accent underline underline-offset-4"
            >
              Your orders
            </Link>
            ; nothing is charged. If you want to cancel an order you have
            already paid for, press &ldquo;Ask to cancel&rdquo; there as soon as
            you can, before it is sent out. A person at MalFleks checks with the
            branch and emails you what happens to the order and your payment.
          </p>
          <p className="mt-2">
            Ordering needs an account. Nothing you type into an order form is
            sent to MalFleks or to a branch until you have signed in and
            continued to payment.
          </p>
        </section>

        {/* Electronic Transactions Act 2015, s.30. */}
        <section id="returns" className="scroll-mt-28">
          <h2 className="font-display text-lg font-medium text-foreground">
            Returning goods after delivery
          </h2>
          <p className="mt-2">
            You may change your mind. Within 7 days after you receive an order,
            you may cancel it, as long as you have not used what you bought.
            Press &ldquo;Return this order&rdquo; on{" "}
            <Link
              href="/account"
              className="text-accent underline underline-offset-4"
            >
              Your orders
            </Link>
            , or email us with the order reference.
          </p>
          <p className="mt-2">
            Return the goods to the branch in the condition you received them.
            You pay only the direct cost of sending them back. Once the branch
            has them, MalFleks refunds the full amount you paid, no later than
            30 days after you cancelled.
          </p>
          <p className="mt-2">
            This right does not cover food, drinks and other goods meant for
            everyday use. Goods that arrive damaged, wrong or not as described
            are a different matter: tell us within 7 days and we will put it
            right with the branch — a replacement, or a full refund that
            includes the cost of sending them back.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            Your account
          </h2>
          <p className="mt-2">
            You sign in with Google. An account is what lets MalFleks keep your
            order, open its checkout for you, email you a receipt and show you
            where the delivery is. Browsing needs no account.
          </p>
          <p className="mt-2">
            Use a phone number and address you can actually be reached at. A
            request with details that go nowhere wastes a real person&apos;s
            morning.
          </p>
          <p className="mt-2">
            <strong>You must be 18 or older to order.</strong> When you place an
            order you confirm that you are. If we learn that an order was placed
            by someone younger, we cancel it and refund what was paid.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            Partners
          </h2>
          <p className="mt-2">
            Businesses apply to be listed and a person at MalFleks reviews every
            application by hand. Approval is not automatic and being approved
            does not put a branch on the map — that is a separate step, taken
            once we have confirmed the address with the business.
          </p>
          <p className="mt-2">
            Products a partner submits are reviewed before they appear.
            Partners are responsible for their own listings being accurate, and
            for honouring the price they published. We remove listings, and
            partners, that are not.
          </p>
          <p className="mt-2">
            Partners take back goods a customer returns under the 7-day rule
            above and give back what they were paid for them. MalFleks may hold
            that amount from the partner&apos;s next payout.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            Brand names and logos
          </h2>
          <p className="mt-2">
            Brand names and logos shown on MalFleks are the trademarks of their
            owners and are used to identify the shops that sell those products.
            Their appearance here is not a claim of endorsement or partnership
            beyond what a listing says.
          </p>
        </section>

        <section id="report" className="scroll-mt-28">
          <h2 className="font-display text-lg font-medium text-foreground">
            Reporting a listing
          </h2>
          <p className="mt-2">
            If a listing uses your photo, your brand or your work without your
            permission, offers something fake or unsafe, or is simply wrong,
            press &ldquo;Report this listing&rdquo; on its page, or email us.
            Say which listing, what is wrong and, for your own work, that it is
            yours.
          </p>
          <p className="mt-2">
            A person at MalFleks reads every report. While we check, we may
            hide the listing. We take down what breaks someone else&apos;s
            rights, tell the partner why, and remove partners who do it again.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            Changes and contact
          </h2>
          <p className="mt-2">
            MalFleks is new and these terms will change as it grows. The date at the
            top says when they last did. Questions, complaints and takedown
            requests go to{" "}
            <a
              href={`mailto:${MALFLEKS_CONTACT_EMAIL}`}
              className="text-accent underline decoration-border underline-offset-4"
            >
              {MALFLEKS_CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>

      <p className="mt-12 text-sm text-muted">
        See also our{" "}
        <Link
          href="/privacy"
          className="text-accent underline decoration-border underline-offset-4"
        >
          privacy notice
        </Link>
        .
      </p>
    </div>
  );
}
