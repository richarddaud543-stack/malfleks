import type { Metadata } from "next";
import Link from "next/link";

import ScrollReveal from "@/components/motion/ScrollReveal";
import { MALFLEKS_CONTACT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What MalFleks collects, who sees it, where it is stored, and how to have it deleted.",
};

/**
 * The privacy notice.
 *
 * Every claim here was checked against the code rather than copied from a
 * template, because a privacy notice is the one document on a site where being
 * approximately right is the same as being wrong:
 *
 *   * The fields listed are the columns in `Order`, `SavedOrderRequest` and
 *     `PartnerApplication` in `prisma/schema.prisma`.
 *   * "Google account" is accurate: Supabase Auth with Google is the only
 *     sign-in method wired up (`src/server/auth/`).
 *   * The storage location is Supabase's eu-west-1 region — that is where this
 *     project's database actually lives, and it is outside Tanzania, which a
 *     Tanzanian visitor is entitled to know.
 *   * The payment paragraph changed on 2 Oct 2026, in the same commit that
 *     opened the customer checkout: payments go through ClickPesa's hosted
 *     page, so MalFleks never receives a PIN or card number, but it does store
 *     the amount, time and ClickPesa's reference (`OrderPayment`,
 *     `LedgerEntry`), and ClickPesa's notification includes the number paid
 *     from, which lands in the error log only if the notification is refused.
 *
 * There is no analytics or advertising section because there is no analytics
 * and no advertising. Do not add a paragraph here in anticipation of one.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <ScrollReveal>
        <p className="font-accent-serif text-xl italic text-accent">MalFleks</p>
        <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
          Privacy
        </h1>
        <p className="mt-3 text-sm text-muted">Last updated 2 October 2026.</p>
      </ScrollReveal>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted">
        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            What we collect
          </h2>
          <p className="mt-2">When you sign in with Google, we store:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>your name and email address as Google gives them to us</li>
            <li>your profile picture, if your Google account has one</li>
          </ul>
          <p className="mt-3">When you send an order request, we store:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>the name, phone number and delivery address you typed</li>
            <li>
              what you asked for, the price at that moment, the branch, and the
              delivery route
            </li>
            <li>the time you sent it and the reference we gave you</li>
          </ul>
          <p className="mt-3">If you apply to be a partner, we store:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              your business name, contact name, phone number, city and address
            </li>
            <li>anything you write in the notes field</li>
          </ul>
          <p className="mt-3">
            When you place an order while signed in, we also keep the email
            address of the Google account you used, so we can send you the link
            to pay and a receipt.
          </p>
          <p className="mt-3">
            <strong className="text-foreground">
              We never see your mobile money PIN or any card number.
            </strong>{" "}
            When you pay for a confirmed order, you do it on a page run by
            ClickPesa, our payment provider. ClickPesa tells us that the payment
            succeeded, how much it was, when, its own reference for it, and the
            mobile money number it came from. We store the amount, the time and
            the reference against your order.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            Who sees it
          </h2>
          <p className="mt-2">
            The branch you send an order request to sees the name, phone number
            and address on that request — that is the point of sending it; they
            cannot deliver to somebody they cannot reach. They do not see your
            other requests, and no other branch sees any of it.
          </p>
          <p className="mt-2">
            When a checkout is opened for your order, ClickPesa receives your
            name, your phone number and the amount, so that it can take the
            payment.
          </p>
          <p className="mt-2">
            MalFleks&apos;s administrators can see order requests and partner
            applications, because a person reviews them. A partner sees only
            their own listings and the requests sent to their own branch.
          </p>
          <p className="mt-2">
            We do not sell your details, and we do not pass them to advertisers.
            There is no advertising on MalFleks and no analytics or tracking scripts
            of any kind.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            Where it is kept
          </h2>
          <p className="mt-2">
            In a Postgres database hosted by Supabase in Ireland (their eu-west-1
            region), and the site itself runs on Vercel. That means your details
            are stored outside Tanzania. Sign-in is handled by Supabase Auth
            using your Google account; we never see or store your Google
            password.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            How long we keep it
          </h2>
          <p className="mt-2">
            Order requests are kept while they are useful to you and to the
            branch — you can see your own on your account page, and a reference
            you quoted last month should still mean something. We have not set
            an automatic deletion period yet, and rather than invent one here we
            will say so plainly and delete anything you ask us to.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            Getting it deleted
          </h2>
          <p className="mt-2">
            Write to{" "}
            <a
              href={`mailto:${MALFLEKS_CONTACT_EMAIL}`}
              className="text-accent underline decoration-border underline-offset-4"
            >
              {MALFLEKS_CONTACT_EMAIL}
            </a>{" "}
            from the address you signed in with and say what you want removed —
            a single order request, or your account and everything attached to
            it. We will do it and tell you when it is done.
          </p>
          <p className="mt-2">
            One limit worth being straight about: a branch that has already
            received your request has your phone number in their own records,
            and we cannot delete that for you. We can tell you who it went to.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            Cookies
          </h2>
          <p className="mt-2">
            MalFleks sets cookies for one purpose: keeping you signed in. There are
            no advertising or tracking cookies, which is why this site has no
            cookie banner asking you to accept any.
          </p>
        </section>
      </div>

      <p className="mt-12 text-sm text-muted">
        See also our{" "}
        <Link
          href="/terms"
          className="text-accent underline decoration-border underline-offset-4"
        >
          terms of use
        </Link>
        .
      </p>
    </div>
  );
}
