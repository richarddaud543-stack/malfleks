"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, type ReactNode } from "react";

export default function CanvasWrapper({
  children,
  position = [0, 0, 9],
  fov = 42,
  className,
}: {
  children: ReactNode;
  position?: [number, number, number];
  fov?: number;
  className?: string;
}) {
  return (
    <Canvas
      className={className}
      dpr={[1, 1.75]}
      camera={{ position, fov }}
      gl={{ antialias: true, alpha: true }}
    >
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  );
}
