import type { DeliveryAgent } from "@/data";

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
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted">ETA: {agent.etaEstimate}</span>
        <a href={`tel:${agent.phone}`} className="font-medium text-accent hover:underline">
          {agent.phone}
        </a>
      </div>
    </div>
  );
}
