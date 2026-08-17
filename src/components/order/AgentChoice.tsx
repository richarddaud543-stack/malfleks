"use client";

import type { DeliveryAgent } from "@/data";
import { formatEta } from "@/lib/format";

/**
 * One selectable courier. Deliberately a plain radio inside its label — the
 * whole card is the hit area, and there is no nested link to swallow the click
 * or add a stop on the keyboard path through the group.
 */
export default function AgentChoice({
  agent,
  name,
  checked,
  describedBy,
  focusKey,
  onSelect,
}: {
  agent: DeliveryAgent;
  /** Shared radio-group name. */
  name: string;
  checked: boolean;
  describedBy?: string;
  /** Marks this radio as the group's focus target after a failed submit. */
  focusKey?: string;
  onSelect: () => void;
}) {
  return (
    <label
      className={`glass-card flex cursor-pointer items-start gap-3 rounded-2xl p-5 transition-colors ${
        checked ? "border-accent/60" : "hover:border-foreground/20"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={agent.id}
        checked={checked}
        onChange={onSelect}
        data-field={focusKey}
        aria-describedby={describedBy}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className="font-display font-medium">{agent.name}</span>
          {agent.verified && (
            <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
              Verified
            </span>
          )}
        </span>
        <span className="mt-1 block text-sm text-muted">
          Based in {agent.city} · Serves {agent.regionsServed.join(", ")}
        </span>
        <span className="mt-2 block text-sm text-muted">
          ETA: {formatEta(agent.eta)} · {agent.phone}
        </span>
      </span>
    </label>
  );
}
