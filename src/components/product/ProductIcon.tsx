import { type ProductIconKey } from "@/lib/product-icons";

export type { ProductIconKey };

interface ProductIconProps {
  icon: string;
  className?: string;
  style?: React.CSSProperties;
}

const paths: Record<ProductIconKey, React.ReactNode> = {
  sedan: (
    <path d="M6 38h4l4-11c1-3 4-5 7-5h10c3 0 6 2 7 5l4 11h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2a5 5 0 0 1-10 0H18a5 5 0 0 1-10 0H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Zm10-13-3 9h22l-3-9c-.5-1.5-2-2.5-3.5-2.5h-9c-1.5 0-3 1-3.5 2.5Z" />
  ),
  suv: (
    <path d="M5 36h3l3-13c1-4 5-7 9-7h8c4 0 7 2 9 5l5 5h1a3 3 0 0 1 3 3v7a2 2 0 0 1-2 2h-2a5 5 0 0 1-10 0H17a5 5 0 0 1-10 0H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm11-18c-2.5 0-4.7 1.7-5.3 4.1L9 30h13V18Zm5 0v12h12l-4-4.5c-1.3-2.6-4-4.5-7-4.5h-1Z" />
  ),
  pickup: (
    <path d="M4 36h3l2-9c.8-3.3 3.8-5.6 7.2-5.6H23v-4a2 2 0 0 1 2-2h6c3.9 0 7.5 2.1 9.4 5.5l3 5.4a4 4 0 0 1 .6 2.1v5.6a2 2 0 0 1-2 2h-2a5 5 0 0 1-10 0H17a5 5 0 0 1-10 0H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Zm12-9.6c-2 0-3.8 1.4-4.3 3.4L10.5 34H23v-7.6Z" />
  ),
  van: (
    <path d="M5 16h24a5 5 0 0 1 5 5v3.3l5.6 3.4A3 3 0 0 1 41 30.4V33a2 2 0 0 1-2 2h-2a5 5 0 0 1-10 0H17a5 5 0 0 1-10 0H5a2 2 0 0 1-2-2V18a2 2 0 0 1 2-2Zm24 4H23v6h11v-1a5 5 0 0 0-5-5Z" />
  ),
  smartphone: (
    <path d="M20 4h8a4 4 0 0 1 4 4v32a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Zm-1 4v28h10V8H19Zm5 30a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
  ),
  tablet: (
    <path d="M14 4h20a4 4 0 0 1 4 4v32a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Zm-1 6v26h22V10H13Zm11 27a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
  ),
  laptop: (
    <path d="M12 10a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v18h3l1.6 4a2 2 0 0 1-1.9 2.7H9.3A2 2 0 0 1 7.4 32l1.6-4h3V10Zm4 1v15h16V11H16Zm-3.6 21-.8 2h20.8l-.8-2H12.4Z" />
  ),
  earbuds: (
    <path d="M17 8a7 7 0 0 1 7 7v16a5 5 0 0 1-10 0v-9a2 2 0 0 0-4 0v2a2 2 0 0 1-4 0v-2a6 6 0 0 1 6-6 5 5 0 0 1 5-8Zm14 0a5 5 0 0 1 5 8 6 6 0 0 1 6 6v2a2 2 0 0 1-4 0v-2a2 2 0 0 0-4 0v9a5 5 0 0 1-10 0V15a7 7 0 0 1 7-7Zm-14 4a3 3 0 0 0-3 3v16a3 3 0 0 0 6 0V15a3 3 0 0 0-3-3Zm14 0a3 3 0 0 0-3 3v16a3 3 0 0 0 6 0V15a3 3 0 0 0-3-3Z" />
  ),
  powerbank: (
    <path d="M16 4h16a4 4 0 0 1 4 4v32a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Zm2 5v3h4V9h-4Zm6 0v3h4V9h-4Zm-8 7 8 10h-4l8 10-2-9h4l-8-9h4l-6-6-4 4Z" />
  ),
  smartwatch: (
    <path d="M18 6h8v6h-8Zm0 26h8v6h-8ZM14 14h16a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4Zm8 4v6l4 3-1.5 2.4L20 26v-8h2Z" />
  ),
  router: (
    <path d="M8 8a1.5 1.5 0 0 1 2.6-1 14 14 0 0 1 3.6 9.4c0 .5-.4 1-1 1s-1-.4-1-1a12 12 0 0 0-3.1-8 1.5 1.5 0 0 1-1.1-.4ZM14 8a1.5 1.5 0 0 1 2.5-1.1A20 20 0 0 1 22 20.5c0 .6-.5 1-1 1s-1-.4-1-1a18 18 0 0 0-4.9-12.4A1.5 1.5 0 0 1 14 8ZM7 22h30a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3Zm3 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm7 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm14-2h4v4h-4v-4Z" />
  ),
  simcard: (
    <path d="M14 4h16l6 6v26a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 10v14h14V14h-4v6h-3v-6h-4v10h-3V14Z" />
  ),
  speaker: (
    <path d="M14 6h16a3 3 0 0 1 3 3v30a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Zm8 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 10a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
  ),
};

export default function ProductIcon({ icon, className, style }: ProductIconProps) {
  const resolved: ProductIconKey = icon in paths ? (icon as ProductIconKey) : "smartphone";

  return (
    <svg
      viewBox="0 0 44 44"
      className={className}
      style={style}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {paths[resolved]}
    </svg>
  );
}
