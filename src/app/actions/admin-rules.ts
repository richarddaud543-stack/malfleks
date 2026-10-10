"use server";

import { revalidatePath } from "next/cache";

import type { ConsoleState } from "@/app/actions/admin-console";
import { adminSession } from "@/server/auth/admin-session";
import { logServerError } from "@/server/error-log";
import { allowRefundRetry } from "@/server/money/refund-send";
import { markAlertHandling, resolveAlert } from "@/server/rules/alerts";
import { runRulebook } from "@/server/rules/engine";
import { ruleByKey } from "@/server/rules/rulebook";
import { restoreHiddenListings } from "@/server/rules/rules/shops";
import { setRuleOff, setRulebookPaused } from "@/server/rules/settings";

/**
 * The owner's side of the rulebook: pause it, switch one rule off, run a pass
 * now, and answer what the rules brought to him.
 *
 * Every action re-checks `adminSession()` itself. A Server Action is a public
 * HTTP endpoint, and the page that drew the button is not its gate.
 *
 * Nothing here can make the rules do more than their code allows. Each switch
 * only takes something away -- and the one thing that sends money, the
 * environment's `AUTO_PAYOUTS=on`, is not reachable from here at all.
 */

const FORBIDDEN: ConsoleState = { status: "error", message: "Your session no longer has admin access. Sign in again." };
const FAILED: ConsoleState = { status: "error", message: "That didn't go through, and nothing changed. It has been logged — try again." };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function refresh() {
  revalidatePath("/admin/rules");
  revalidatePath("/admin");
}

export async function setRulebookPausedAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const paused = field(formData, "paused") === "true";
  try {
    await setRulebookPaused(paused, session.uid);
    refresh();
    return {
      status: "ok",
      message: paused
        ? "The rules are paused. Nothing will be reminded, cancelled, refunded or paid until you start them again. ClickPesa is still watched."
        : "The rules are running again. The next pass does whatever is due.",
    };
  } catch (error) {
    await logServerError("rules-pause", error, session.uid);
    return FAILED;
  }
}

export async function setRuleOffAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const rule = ruleByKey(field(formData, "ruleKey"));
  if (!rule) return { status: "error", message: "There is no rule by that name." };
  const off = field(formData, "off") === "true";
  try {
    await setRuleOff(rule.key, off, session.uid);
    refresh();
    return { status: "ok", message: off ? `"${rule.title}" is switched off.` : `"${rule.title}" is switched on.` };
  } catch (error) {
    await logServerError("rules-toggle", error, session.uid);
    return FAILED;
  }
}

export async function runRulesNowAction(): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  // `runRulebook` never throws; it records its own failures.
  const run = await runRulebook("manual");
  refresh();
  if (run.skipped === "busy") return { status: "ok", message: "A pass is already running. Look again in a minute." };
  if (!run.runId) return { status: "error", message: "The pass could not start. It has been logged." };
  return { status: run.ok ? "ok" : "error", message: run.summary };
}

export async function alertHandlingAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  try {
    const ok = await markAlertHandling(field(formData, "id"));
    refresh();
    return ok
      ? { status: "ok", message: "Marked as yours. The rules will not act on this by themselves." }
      : { status: "error", message: "This one has already been dealt with." };
  } catch (error) {
    await logServerError("rules-alert-handling", error, session.uid);
    return FAILED;
  }
}

export async function alertResolveAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  try {
    const ok = await resolveAlert(field(formData, "id"), session.uid);
    refresh();
    return ok ? { status: "ok", message: "Closed." } : { status: "error", message: "This one has already been closed." };
  } catch (error) {
    await logServerError("rules-alert-resolve", error, session.uid);
    return FAILED;
  }
}

/** Put back the products the reliability rule hid, and close its alert. */
export async function restoreListingsAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const id = field(formData, "id");
  try {
    const restored = await restoreHiddenListings(id);
    // Closing the alert is what tells the rule this shop has been answered
    // for: only failures after this moment count toward hiding it again.
    await resolveAlert(id, session.uid);
    refresh();
    revalidatePath("/admin/catalogue");
    return { status: "ok", message: `${restored} product${restored === 1 ? " is" : "s are"} back on the shop. The shop starts again with a clean count.` };
  } catch (error) {
    await logServerError("rules-restore-listings", error, session.uid);
    return FAILED;
  }
}

/** Let an automatic refund that never left be tried again on the next pass. */
export async function retryRefundAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  try {
    const allowed = await allowRefundRetry(field(formData, "orderId"));
    if (!allowed) {
      return { status: "error", message: "This refund may already have left MalFleks, so it cannot be tried again automatically. Check ClickPesa, then send and record it by hand." };
    }
    await resolveAlert(field(formData, "id"), session.uid);
    refresh();
    return { status: "ok", message: "It will be tried again on the next pass (within 15 minutes). You will be told if it fails again." };
  } catch (error) {
    await logServerError("rules-retry-refund", error, session.uid);
    return FAILED;
  }
}
