"use client";

import Link from "next/link";
import { useRef } from "react";
import { PROMISE } from "@/lib/promise";
import { usePrefersReducedMotion, useSceneReveal } from "./useSceneTimeline";

/**
 * Scene 02 — the promise.
 *
 * Added 3 Oct 2026, when the owner settled what MalFleks is for. People here
 * already buy online, through Instagram and WhatsApp, and the thing that goes
 * wrong is not finding the goods: it is sending mobile money to a stranger and
 * hoping. MalFleks stands in the middle and holds the money until the order
 * arrives. That is the reason to use it, so it is the second thing the home
 * page says — ahead of the delivery rule, which is how the order travels, not
 * why you would trust it.
 *
 * The words come from `PROMISE`, which is held to what `/terms#paying` says.
 */
export default function ScenePromise() {
  const scope = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  useSceneReveal(scope, reduced, { stagger: 0.1 });

  return (
    <section ref={scope} className="relative px-5 py-28 sm:py-36" data-testid="scene-promise">
      <div className="mx-auto max-w-6xl">
        <p data-reveal className="scene-eyebrow">
          02 — The promise
        </p>
        <h2 data-reveal className="scene-display-sm mt-5 max-w-4xl">
          Your money is held until your order{" "}
          <em className="scene-serif">arrives</em>
        </h2>
        <p
          data-reveal
          lang="sw"
          className="mt-4 text-xl"
          style={{ color: "var(--scene-lime)" }}
        >
          {PROMISE.swahili}
        </p>
        <p
          data-reveal
          className="mt-5 max-w-2xl text-lg leading-relaxed"
          style={{ color: "var(--scene-muted)" }}
        >
          Buying online usually means sending money to someone you have never
          met and hoping. On MalFleks you pay us, we hold it, and the shop is
          paid only once your order has been delivered.
        </p>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {PROMISE.points.map((point, index) => (
            <article key={point.title} data-reveal className="scene-panel p-8">
              <p className="scene-num text-sm" style={{ color: "var(--scene-mint)" }}>
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3
                className="scene-display-sm mt-5"
                style={{ fontSize: "clamp(1.3rem,2.2vw,1.75rem)" }}
              >
                {point.title}
              </h3>
              <p className="mt-4 leading-relaxed" style={{ color: "var(--scene-muted)" }}>
                {point.body}
              </p>
            </article>
          ))}
        </div>

        <p data-reveal className="mt-10 text-sm" style={{ color: "var(--scene-muted)" }}>
          <Link
            href={PROMISE.link.href}
            className="underline underline-offset-4"
            style={{ color: "var(--scene-lime)" }}
          >
            {PROMISE.link.label}
          </Link>
        </p>
      </div>
    </section>
  );
}
