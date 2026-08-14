export default function DeliveryBadge({
  deliveryOffered,
  className,
}: {
  deliveryOffered: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        deliveryOffered
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-amber-500/15 text-amber-400"
      } ${className ?? ""}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          deliveryOffered ? "bg-emerald-400" : "bg-amber-400"
        }`}
      />
      {deliveryOffered ? "Brand delivery" : "Local agent delivery"}
    </span>
  );
}
