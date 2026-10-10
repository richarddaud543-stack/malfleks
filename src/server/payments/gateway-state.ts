import { getPrisma } from "@/server/db/client";

/**
 * Whether ClickPesa is answering this deployment, as last observed.
 *
 * ## Why this is written down at all
 *
 * On 8 Oct 2026 ClickPesa began refusing the site's token request. Every
 * payment check failed, twice a day, for two days, and the only trace was a
 * line in the error log. Nobody was told, and the site went on offering a pay
 * page that could not work. "Is the payment provider reachable" was a fact the
 * site kept rediscovering and never remembered.
 *
 * This is where it is remembered. The rulebook (`src/server/rules/`) records
 * each observation here; the checkout reads it so that a customer is not sent
 * to make a link that cannot be made; and the change from up to down, and back,
 * is what tells the owner.
 *
 * ## One failure is not an outage
 *
 * A single timeout on mobile data, or one bad minute at ClickPesa, should not
 * text the owner at night. The first failed observation is `suspect`; the
 * second in a row is `down`. With a fifteen-minute clock that is at most half
 * an hour from the first failure to the alert.
 *
 * ## Stale means unknown
 *
 * The state is only as fresh as the last pass of the rulebook. If the clock
 * that runs the rulebook stops, a `down` written before it stopped would
 * otherwise keep customers from paying for ever, with nothing left running to
 * notice ClickPesa had come back. So a reading older than
 * `GATEWAY_STATE_FRESH_MINUTES` is treated as "not known", and the checkout
 * simply tries ClickPesa as it always did.
 */

const SETTING_KEY = "paymentsGateway";

/** Consecutive failed observations before the gateway is called down. */
export const FAILURES_BEFORE_DOWN = 2;

/**
 * A reading older than this no longer stops the checkout from trying. Longer
 * than the slowest pace the rulebook re-checks a gateway that is down (once an
 * hour -- see `probeDue` in `src/server/rules/rules/gateway.ts`), so a `down`
 * does not flicker to "unknown" between two checks.
 */
export const GATEWAY_STATE_FRESH_MINUTES = 90;

export type GatewayStatus = "up" | "suspect" | "down";

export interface GatewayState {
  status: GatewayStatus;
  /** When it entered this status (ISO). For `down`, when the first failure of the run was seen. */
  since: string;
  /** When it was last observed, whatever the answer (ISO). */
  checkedAt: string;
  /** Failed observations in a row. Zero when up. */
  failures: number;
  /** What ClickPesa (or the network) said the last time it failed. */
  detail: string | null;
  /** The most recent outage that has ended, kept so orders stranded by it can be found. */
  lastOutage: { since: string; until: string } | null;
}

export type GatewayChange = "went-down" | "came-back" | null;

/**
 * The state after one more observation -- pure, so every edge is testable
 * without a database or a clock.
 */
export function nextGatewayState(
  previous: GatewayState | null,
  observation: { ok: boolean; detail?: string | null },
  now: Date,
): { state: GatewayState; change: GatewayChange } {
  const at = now.toISOString();
  const lastOutage = previous?.lastOutage ?? null;

  if (observation.ok) {
    if (previous?.status === "down") {
      return {
        state: { status: "up", since: at, checkedAt: at, failures: 0, detail: null, lastOutage: { since: previous.since, until: at } },
        change: "came-back",
      };
    }
    return {
      state: { status: "up", since: previous?.status === "up" ? previous.since : at, checkedAt: at, failures: 0, detail: null, lastOutage },
      change: null,
    };
  }

  const detail = observation.detail?.slice(0, 300) ?? previous?.detail ?? null;
  const failures = (previous?.failures ?? 0) + 1;

  if (previous?.status === "down") {
    return { state: { ...previous, checkedAt: at, failures, detail }, change: null };
  }
  // The outage is dated from its first failure, not from the pass that decided
  // it was one: that is the moment customers started being turned away.
  const since = previous?.status === "suspect" ? previous.since : at;
  if (failures >= FAILURES_BEFORE_DOWN) {
    return { state: { status: "down", since, checkedAt: at, failures, detail, lastOutage }, change: "went-down" };
  }
  return { state: { status: "suspect", since, checkedAt: at, failures, detail, lastOutage }, change: null };
}

function parseState(value: string | null | undefined): GatewayState | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(value) as Partial<GatewayState> | null;
    if (!raw || typeof raw !== "object") return null;
    if (raw.status !== "up" && raw.status !== "suspect" && raw.status !== "down") return null;
    if (typeof raw.since !== "string" || typeof raw.checkedAt !== "string") return null;
    const outage = raw.lastOutage;
    return {
      status: raw.status,
      since: raw.since,
      checkedAt: raw.checkedAt,
      failures: typeof raw.failures === "number" && raw.failures >= 0 ? raw.failures : 0,
      detail: typeof raw.detail === "string" ? raw.detail : null,
      lastOutage: outage && typeof outage.since === "string" && typeof outage.until === "string" ? { since: outage.since, until: outage.until } : null,
    };
  } catch {
    // A value nobody can read is the same as no value: unknown.
    return null;
  }
}

/** The last recorded state, or null when the gateway has never been observed. */
export async function readGatewayState(): Promise<GatewayState | null> {
  const row = await getPrisma().appSetting.findUnique({ where: { key: SETTING_KEY }, select: { value: true } });
  return parseState(row?.value);
}

/** Record one observation and say whether it changed anything the owner should hear about. */
export async function recordGatewayObservation(
  observation: { ok: boolean; detail?: string | null },
  now: Date = new Date(),
): Promise<{ state: GatewayState; change: GatewayChange }> {
  const next = nextGatewayState(await readGatewayState(), observation, now);
  const value = JSON.stringify(next.state);
  await getPrisma().appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value, updatedBy: "system:rules" },
    update: { value, updatedBy: "system:rules" },
  });
  return next;
}

/** `down`, and observed recently enough to act on. */
export function isFreshlyDown(state: GatewayState | null, now: Date): boolean {
  if (state?.status !== "down") return false;
  const checked = Date.parse(state.checkedAt);
  return Number.isFinite(checked) && now.getTime() - checked <= GATEWAY_STATE_FRESH_MINUTES * 60_000;
}

/**
 * Should the checkout skip ClickPesa because it is known to be down?
 *
 * Never throws and answers `false` when it cannot tell: a settings table that
 * cannot be read must not be the reason a customer cannot pay.
 */
export async function gatewayIsDown(now: Date = new Date()): Promise<boolean> {
  try {
    return isFreshlyDown(await readGatewayState(), now);
  } catch {
    return false;
  }
}
