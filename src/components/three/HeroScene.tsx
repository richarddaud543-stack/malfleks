"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Float,
  RoundedBox,
  Html,
  OrbitControls,
  MeshDistortMaterial,
  Billboard,
} from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import type { Group, Mesh } from "three";
import CanvasWrapper from "./CanvasWrapper";
import { brands } from "@/data";

function OrbitingBrands() {
  const group = useRef<Group>(null);

  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.12;
    }
  });

  const radius = 4.2;

  return (
    <group ref={group}>
      {brands.map((brand, i) => {
        const angle = (i / brands.length) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        return (
          <Float
            key={brand.id}
            speed={1.4}
            rotationIntensity={0.25}
            floatIntensity={0.9}
          >
            <group position={[x, 0, z]}>
              <Billboard>
                <RoundedBox args={[1.7, 1.7, 0.12]} radius={0.14} smoothness={4}>
                  <meshPhysicalMaterial
                    color="#12141c"
                    roughness={0.25}
                    metalness={0.1}
                    transmission={0.35}
                    thickness={0.6}
                    clearcoat={0.6}
                  />
                </RoundedBox>
                <Html
                  transform
                  distanceFactor={4.2}
                  position={[0, 0, 0.08]}
                  occlude
                >
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white/95 p-4 shadow-xl">
                    {/* next/image doesn't apply inside a drei Html/R3F transform portal — plain img is correct here */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={brand.logo}
                      alt={brand.name}
                      className="max-h-full max-w-full object-contain"
                      draggable={false}
                    />
                  </div>
                </Html>
              </Billboard>
            </group>
          </Float>
        );
      })}
    </group>
  );
}

function Core() {
  const mesh = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (mesh.current) {
      mesh.current.rotation.x += delta * 0.15;
      mesh.current.rotation.y += delta * 0.2;
    }
  });

  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1.35, 4]} />
      <MeshDistortMaterial
        color="#7c9eff"
        speed={1.8}
        distort={0.4}
        roughness={0.05}
        metalness={0.75}
        emissive="#7c9eff"
        emissiveIntensity={0.9}
      />
    </mesh>
  );
}

export default function HeroScene() {
  return (
    <CanvasWrapper position={[0, 1.4, 9.5]} fov={45} className="h-full w-full">
      <ambientLight intensity={0.35} />
      <pointLight position={[6, 6, 6]} intensity={120} color="#8fb0ff" />
      <pointLight position={[-6, -2, 2]} intensity={90} color="#c65bff" />
      <pointLight position={[0, -4, -4]} intensity={50} color="#ff8a5c" />
      <directionalLight position={[0, 5, 5]} intensity={0.4} />

      <Core />
      <OrbitingBrands />

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate
        autoRotateSpeed={0.6}
        minPolarAngle={Math.PI / 2.6}
        maxPolarAngle={Math.PI / 1.7}
      />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.25}
          luminanceSmoothing={0.9}
          intensity={0.9}
          mipmapBlur
        />
      </EffectComposer>
    </CanvasWrapper>
  );
}
