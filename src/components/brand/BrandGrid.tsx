import type { Brand } from "@/data";
import BrandCard from "./BrandCard";
import ScrollReveal from "../motion/ScrollReveal";

export default function BrandGrid({ brands }: { brands: Brand[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {brands.map((brand, i) => (
        <ScrollReveal key={brand.id} delay={i * 0.05}>
          <BrandCard brand={brand} />
        </ScrollReveal>
      ))}
    </div>
  );
}
