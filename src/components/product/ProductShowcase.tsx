import ProductIcon from "./ProductIcon";
import { iconAccent } from "@/lib/accent";

/**
 * What stands in for a product that has no photo: the picture the seller
 * chose from the icon set, on a tinted panel, and the words "No photo yet".
 *
 * The words are the point. The first live listing was a headset shown as a
 * wristwatch, because that was the icon picked; with nothing saying so, a
 * buyer could take the drawing for the product. An icon is a category, not
 * the item, and the page now says which it is looking at.
 *
 * A plain server component since 4 Oct 2026. It used to fade and scale in
 * from nothing once its script loaded, then bob up and down forever -- the
 * main picture on the product page was invisible until JavaScript arrived,
 * and never still afterwards.
 */
export default function ProductShowcase({
  accentColor,
  icon,
}: {
  accentColor: string;
  icon: string;
}) {
  const iconColor = iconAccent(accentColor);

  return (
    <div
      className="glass-card shadow-float relative flex h-full w-full items-center justify-center overflow-hidden rounded-[1.75rem] sm:rounded-[2rem]"
      style={{
        background: `linear-gradient(135deg, ${accentColor}14, var(--surface-2) 65%)`,
      }}
    >
      {/* Concentric rings behind the icon: depth without a second colour. */}
      <div aria-hidden="true" className="absolute flex items-center justify-center">
        <div className="h-56 w-56 rounded-full border sm:h-64 sm:w-64" style={{ borderColor: `${accentColor}22` }} />
        <div className="absolute h-40 w-40 rounded-full border sm:h-48 sm:w-48" style={{ borderColor: `${accentColor}33` }} />
      </div>

      <div
        className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full sm:h-36 sm:w-36"
        style={{ background: `${accentColor}1f` }}
      >
        <ProductIcon icon={icon} className="h-16 w-16 sm:h-20 sm:w-20" style={{ color: iconColor }} />
      </div>

      <p className="absolute bottom-4 rounded-full bg-background/80 px-3 py-1 text-xs text-muted" data-testid="no-photo-note">
        No photo yet
      </p>
    </div>
  );
}
