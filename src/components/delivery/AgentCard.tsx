import { PLACES } from "@/i18n/copy/places";
import type { Locale } from "@/i18n/locale";
import type { DeliveryAgent } from "@/data";
import { formatEta } from "@/lib/format";
import { displayPhone } from "@/lib/order";

export default function AgentCard({ agent, locale = "en" }: { agent: DeliveryAgent; locale?: Locale }) {
  const copy = PLACES[locale].agents;

  return (
    <div className="glass-card rounded-2xl p-5 transition-colors hover:border-white/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-medium">{agent.name}</h3>
          <p className="mt-1 text-sm text-muted">
            {copy.based(agent.city, agent.regionsServed.join(", "))}
          </p>
        </div>
        {agent.verified && (
          <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
            {copy.verified}
          </span>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">{copy.eta(formatEta(agent.eta, locale))}</span>
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
            {copy.noNumber}
          </span>
        )}
      </div>
    </div>
  );
}
