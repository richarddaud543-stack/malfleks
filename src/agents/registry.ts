import type { Agent } from "./types";
import { watchman } from "./watchman";

/**
 * The roster: who lives in the city.
 *
 * Adding an agent is adding a line here and a file beside it. There is no
 * "create agent" screen, and that is the point -- a job description, a read
 * scope and a write scope are reviewed in a pull request, not typed into a
 * form at midnight.
 *
 * The offices the city is laid out in are the `office` field on each agent, so
 * a new department appears the moment its first resident does.
 */
export const AGENTS: Agent[] = [watchman];

const BY_KEY = new Map(AGENTS.map((agent) => [agent.key, agent]));

export function agentByKey(key: string): Agent | undefined {
  return BY_KEY.get(key);
}

/** The offices, in the order their first agent was hired, each with its residents. */
export function offices(): { office: string; agents: Agent[] }[] {
  const grouped: { office: string; agents: Agent[] }[] = [];
  for (const agent of AGENTS) {
    const existing = grouped.find((entry) => entry.office === agent.office);
    if (existing) existing.agents.push(agent);
    else grouped.push({ office: agent.office, agents: [agent] });
  }
  return grouped;
}
