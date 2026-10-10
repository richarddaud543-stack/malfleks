import { getPrisma } from "@/server/db/client";

/**
 * The owner's switches for the rulebook.
 *
 * Two of them, both stored in `AppSetting` so they need no deploy:
 *
 * - **Paused.** Every rule that would change something stops. The rulebook
 *   still runs, still watches ClickPesa and still records what became of money
 *   that had already been sent -- pausing must not mean going blind.
 * - **Off, one rule at a time.** A list of rule keys.
 *
 * Like every switch in this codebase, these can only make the site do *less*
 * than its code and environment allow. Sending money needs a third thing that
 * is not here at all: `AUTO_PAYOUTS=on` on the deployment, and the Payouts
 * page's own pause not being set (see `src/server/money/auto-payouts.ts`).
 */

const PAUSED_KEY = "rulebookPaused";
const OFF_KEY = "rulebookOff";

export interface RulebookSettings {
  paused: boolean;
  /** Keys of rules the owner has switched off. */
  off: Set<string>;
}

function parseOff(value: string | null | undefined): Set<string> {
  if (!value) return new Set();
  try {
    const raw: unknown = JSON.parse(value);
    return new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : []);
  } catch {
    // An unreadable list switches nothing off: the rules run as written.
    return new Set();
  }
}

export async function readRulebookSettings(): Promise<RulebookSettings> {
  const rows = await getPrisma().appSetting.findMany({
    where: { key: { in: [PAUSED_KEY, OFF_KEY] } },
    select: { key: true, value: true },
  });
  const value = (key: string) => rows.find((r) => r.key === key)?.value;
  return { paused: value(PAUSED_KEY) === "true", off: parseOff(value(OFF_KEY)) };
}

async function write(key: string, value: string, by: string): Promise<void> {
  await getPrisma().appSetting.upsert({
    where: { key },
    create: { key, value, updatedBy: by },
    update: { value, updatedBy: by },
  });
}

export function setRulebookPaused(paused: boolean, by: string): Promise<void> {
  return write(PAUSED_KEY, paused ? "true" : "false", by);
}

/** Switch one rule on or off. Reads the list and writes it back; two admins toggling at once is not a case worth a lock. */
export async function setRuleOff(ruleKey: string, off: boolean, by: string): Promise<void> {
  const current = (await readRulebookSettings()).off;
  if (off) current.add(ruleKey);
  else current.delete(ruleKey);
  await write(OFF_KEY, JSON.stringify([...current].sort()), by);
}
