import Image from "next/image";
import Link from "next/link";
import type { Brand } from "@/data";

export default function BrandCard({ brand }: { brand: Brand }) {
  return (
    <Link
      href={`/brands/${brand.slug}`}
      className="group glass-card tint-glow relative block overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-white/25"
      style={{ "--tint": brand.accentColor } as React.CSSProperties}
    >
      <div
        className="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-25 blur-2xl transition-opacity duration-300 group-hover:opacity-50"
        style={{ background: brand.accentColor }}
      />
      <div className="relative h-16 w-16 rounded-xl bg-white p-3 shadow-lg">
        <Image
          src={brand.logo}
          alt={brand.name}
          fill
          sizes="64px"
          className="object-contain p-3"
        />
      </div>
      <h3 className="relative mt-4 font-display text-lg font-medium">
        {brand.name}
      </h3>
      <p className="relative mt-1 text-xs uppercase tracking-wide text-muted">
        {brand.category}
      </p>
      <p className="relative mt-3 line-clamp-2 text-sm text-muted">
        {brand.description}
      </p>
    </Link>
  );
}
