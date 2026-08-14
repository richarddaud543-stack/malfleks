"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Float, Html, MeshDistortMaterial } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import type { Group, Mesh } from "three";
import CanvasWrapper from "./CanvasWrapper";
import ProductIcon from "../product/ProductIcon";

function PedestalWithIcon({
  accentColor,
  icon,
}: {
  accentColor: string;
  icon: string;
}) {
  const rig = useRef<Group>(null);
  const core = useRef<Mesh>(null);

  useFrame((state, delta) => {
    if (core.current) {
      core.current.rotation.y += delta * 0.35;
      core.current.rotation.x += delta * 0.08;
    }
    if (rig.current) {
      const { pointer } = state;
      rig.current.rotation.y += (pointer.x * 0.4 - rig.current.rotation.y) * 0.04;
      rig.current.rotation.x += (-pointer.y * 0.2 - rig.current.rotation.x) * 0.04;
    }
  });

  return (
    <group ref={rig}>
      <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.6}>
        <mesh ref={core} position={[0, 0.1, 0]}>
          <icosahedronGeometry args={[1.5, 6]} />
          <MeshDistortMaterial
            color={accentColor}
            speed={1.4}
            distort={0.28}
            roughness={0.08}
            metalness={0.7}
            emissive={accentColor}
            emissiveIntensity={0.6}
          />
        </mesh>
      </Float>

      <mesh position={[0, -1.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.5, 2, 64]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.18} />
      </mesh>

      <Html center position={[0, 0.1, 1.6]} distanceFactor={5.5} occlude>
        <div
          className="flex h-28 w-28 items-center justify-center rounded-full shadow-2xl"
          style={{ background: `${accentColor}22`, boxShadow: `0 0 60px ${accentColor}55` }}
        >
          <ProductIcon icon={icon} className="h-16 w-16" />
        </div>
      </Html>
    </group>
  );
}

export default function ProductShowcaseScene({
  accentColor,
  icon,
}: {
  accentColor: string;
  icon: string;
}) {
  return (
    <CanvasWrapper position={[0, 0.6, 6.5]} fov={40} className="h-full w-full">
      <ambientLight intensity={0.3} />
      <pointLight position={[4, 4, 4]} intensity={90} color={accentColor} />
      <pointLight position={[-4, -2, -3]} intensity={45} color="#ffffff" />
      <pointLight position={[0, -3, 3]} intensity={30} color="#c65bff" />
      <directionalLight position={[0, 4, 4]} intensity={0.35} />

      <PedestalWithIcon accentColor={accentColor} icon={icon} />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.2}
          luminanceSmoothing={0.9}
          intensity={1}
          mipmapBlur
        />
      </EffectComposer>
    </CanvasWrapper>
  );
}
