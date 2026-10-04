import { Suspense } from "react";
import type { Metadata } from "next";
import ScrollReveal from "@/components/motion/ScrollReveal";
import SignInPanel from "@/components/auth/SignInPanel";
import { isAuthConfigured } from "@/server/auth/config";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to MalFleks to order, pay by mobile money, and track your delivery.",
  // A sign-in button has nothing for a search result to show. Still crawlable,
  // so links from it count; just not listed.
  robots: { index: false, follow: true },
};

export default function SignInPage() {
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="blob left-[15%] top-[-140px] h-[300px] w-[300px]"
          style={{ background: "var(--accent)", opacity: 0.16 }}
        />
        <div
          className="blob right-[10%] top-[-80px] h-[260px] w-[260px]"
          style={{
            background: "var(--lime)",
            opacity: 0.14,
            animationDelay: "-6s",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-lg px-5 py-16">
        <ScrollReveal>
          <p className="font-accent-serif text-xl italic text-accent">
            Order and pay safely
          </p>
          <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
            Sign in to MalFleks
          </h1>
          <p className="mt-3 text-muted">
            Sign in to order. You pay MalFleks by mobile money, we hold your
            payment until the order reaches you, and you can follow the
            delivery from your account.
          </p>
        </ScrollReveal>

        <div className="mt-8">
          {/* useSearchParams needs a Suspense boundary to keep this route
              static — the same reason /search has one. */}
          <Suspense fallback={<PanelSkeleton />}>
            <SignInPanel configured={isAuthConfigured()} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="glass-card animate-pulse rounded-2xl p-6">
      <div className="h-12 rounded-full bg-surface" />
      <div className="mt-6 h-4 w-3/4 rounded bg-surface" />
    </div>
  );
}
