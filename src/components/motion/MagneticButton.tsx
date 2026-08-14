"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useMotionValue, useSpring } from "motion/react";

const springConfig = { stiffness: 300, damping: 20, mass: 0.4 };

export default function MagneticButton({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  function handleMouseMove(e: React.MouseEvent<HTMLAnchorElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - rect.left - rect.width / 2) * 0.35);
    y.set((e.clientY - rect.top - rect.height / 2) * 0.35);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  const base =
    "relative inline-flex items-center justify-center rounded-full px-7 py-3.5 text-sm font-medium transition-shadow";
  const styles =
    variant === "primary"
      ? "bg-accent text-background shadow-[0_0_0_0_rgba(124,158,255,0)] hover:shadow-[0_0_32px_4px_rgba(124,158,255,0.45)]"
      : "border border-border text-foreground hover:border-white/40 hover:shadow-[0_0_24px_2px_rgba(255,255,255,0.08)]";

  return (
    <motion.div style={{ x: springX, y: springY }} className="inline-block">
      <Link
        ref={ref}
        href={href}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={`${base} ${styles} ${className ?? ""}`}
      >
        {children}
      </Link>
    </motion.div>
  );
}
