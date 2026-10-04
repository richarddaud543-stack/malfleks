import type { DeliveryAgent } from "@/data";
import { formatEta } from "@/lib/format";
import { displayPhone } from "@/lib/order";

export default function AgentCard({ agent }: { agent: DeliveryAgent }) {
  return (
    <div className="glass-card rounded-2xl p-5 transition-colors hover:border-white/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-medium">{agent.name}</h3>
          <p className="mt-1 text-sm text-muted">
            Based in {agent.city} · Serves {agent.regionsServed.join(", ")}
          </p>
        </div>
        {agent.verified && (
          <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
            Verified
          </span>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">ETA: {formatEta(agent.eta)}</span>
        {/*
          A courier with no published number renders no link at all — not a
          dead `tel:` and not a placeholder. This mirrors what
          `OrderConfirmation` already does for a branch without a phone, and
          it exists because the numbers that used to sit here were invented.
          Telling someone to call a number nobody answers is worse than
          telling them we do not have one.
        */}
        {agent.phone ? (
          <a href={`tel:${agent.phone}`} className="font-medium text-accent hover:underline">
            {displayPhone(agent.phone)}
          </a>
        ) : (
          <span className="text-right text-xs text-muted">
            No published number — arranged through the branch
          </span>
        )}
      </div>
    </div>
  );
}
