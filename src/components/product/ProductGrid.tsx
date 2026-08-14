import type { Product } from "@/data";
import ProductCard from "./ProductCard";
import ScrollReveal from "../motion/ScrollReveal";

export default function ProductGrid({
  products,
  accentColor,
}: {
  products: Product[];
  accentColor: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product, i) => (
        <ScrollReveal key={product.id} delay={i * 0.04}>
          <ProductCard product={product} accentColor={accentColor} />
        </ScrollReveal>
      ))}
    </div>
  );
}
