import type { Metadata } from "next";
import Link from "next/link";

import ScrollReveal from "@/components/motion/ScrollReveal";
import { SOKO_CONTACT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "How to reach Soko — one email address, read by a person, with what to include so we can help quickly.",
};

/**
 * Contact.
 *
 * One address, no form. A contact form would need a mailbox behind it and a
 * reply path, and until both exist a form is a suggestion box that silently
 * drops what it is given — the same failure as a phone number that rings
 * nowhere. When notifications are wired and answered, a form can be added.
 *
 * The page also says how long a reply takes, in words that will still be true
 * on a bad week. "Within 24 hours" from a one-person operation is a promise
 * broken the first time someone travels.
 */
export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <ScrollReveal>
        <p className="font-accent-serif text-xl italic text-accent">Soko</p>
        <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
          Contact
        </h1>
        <p className="mt-4 max-w-prose text-muted">
          Soko is small, and a person reads everything that comes in. One
          address, and it is checked.
        </p>
      </ScrollReveal>

      <div className="glass-card mt-10 rounded-2xl px-6 py-8 text-center">
        <p className="text-sm text-muted">Email</p>
        <a
          href={`mailto:${SOKO_CONTACT_EMAIL}`}
          className="mt-1 block break-words font-display text-xl font-medium text-accent underline decoration-border underline-offset-4"
        >
          {SOKO_CONTACT_EMAIL}
        </a>
        <p className="mx-auto mt-4 max-w-sm text-xs text-muted">
          We aim to answer within a couple of working days. If something has
          gone wrong with an order, say so in the subject line and it gets read
          first.
        </p>
      </div>

      <div className="mt-12 space-y-8 text-sm leading-relaxed text-muted">
        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            About an order you sent
          </h2>
          <p className="mt-2">
            Include the reference from your confirmation — it is the fastest way
            to find the exact request. Remember that Soko passes your request to
            the branch and takes no payment: if you have already agreed a price
            or a delivery time with them, they are the ones who can change it.
            If they have gone quiet, tell us and we will chase them.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            About listing your business
          </h2>
          <p className="mt-2">
            Start with the{" "}
            <Link
              href="/apply"
              className="text-accent underline decoration-border underline-offset-4"
            >
              partner application
            </Link>{" "}
            rather than an email — it asks for what we need to check, and it
            lands in the review queue instead of an inbox.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            About a listing that is wrong
          </h2>
          <p className="mt-2">
            An address that does not exist, a price that is out of date, a brand
            or logo used where it should not be — send the link and what is
            wrong with it. We would rather take a listing down and put it back
            than leave a customer travelling to the wrong place.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-foreground">
            About your data
          </h2>
          <p className="mt-2">
            What we hold and how to have it deleted is set out in the{" "}
            <Link
              href="/privacy"
              className="text-accent underline decoration-border underline-offset-4"
            >
              privacy notice
            </Link>
            . Write from the address you signed in with and we will act on it.
          </p>
        </section>
      </div>
    </div>
  );
}
