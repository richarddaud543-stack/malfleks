import type { Metadata } from "next";
import Link from "next/link";

import ScrollReveal from "@/components/motion/ScrollReveal";
import { MALFLEKS_CONTACT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Terms of use",
  description:
    "What MalFleks does and does not do: we list branches and pass order requests to them. We take no payment, hold no stock and are not a party to the sale.",
};

/**
 * Terms of use.
 *
 * Written to describe **what this site actually does**, which is narrower than
 * most marketplace terms and should stay that way: MalFleks takes no payment,
 * holds no stock, and never becomes a party to the sale. An order request is
 * a message passed to a branch. Terms that implied otherwise would be the
 * document's own first lie, and would also be the thing a customer quotes back
 * when a deal goes wrong.
 *
 * Not legal advice and not drafted by a lawyer — it says plainly what happens.
 * If MalFleks starts holding money, this document has to be rewritten by someone
 * qualified before that ships.
 */
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <ScrollReveal>
        <p className="font-accent-serif text-xl italic text-accent">MalFleks</p>
        <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
          Terms of use
        </h1>
        <p className="mt-3 text-sm text-muted">Last updated 1 September 2026.</p>
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
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            What MalFleks is not
          </h2>
          <p className="mt-2">
            MalFleks is <strong>not a shop</strong>. We take no payment, hold no
            stock, and are not a party to any sale. Price, availability,
            delivery and any refund are agreed between you and the branch. If a
            branch does not have what it listed, or the price has changed, that
            is a conversation between you and them — though we do want to hear
            about it, because a branch that keeps doing it does not belong here.
          </p>
          <p className="mt-2">
            An order request is not a confirmed order. Nothing is reserved until
            the branch tells you so.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            Your account
          </h2>
          <p className="mt-2">
            You sign in with Google. You need an account to send an order
            request, so that the request is attached to someone a branch can
            reach and so you can look your own requests up later. Browsing needs
            no account.
          </p>
          <p className="mt-2">
            Use a phone number and address you can actually be reached at. A
            request with details that go nowhere wastes a real person&apos;s
            morning.
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
