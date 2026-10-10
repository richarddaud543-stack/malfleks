import type { Prisma } from "@prisma/client";

import { resolveAdminUrl } from "@/lib/site-url";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { sendNotification } from "@/server/notify/email";
import { sendSms } from "@/server/notify/sms";

/**
 * Telling the owner -- once, and only about what needs him.
 *
 * ## Why not just send an email
 *
 * The rulebook runs every fifteen minutes. A condition that is true now ("the
 * payment provider is down", "this order is three days late") is still true at
 * the next pass, and the one after. A rule that emailed whenever its condition
 * held would send ninety-six emails a day about one problem, and the owner
 * would stop reading them by the second morning.
 *
 * So a problem is a row, not a message. `raiseAlert` opens one, and while it
 * is open the same problem cannot open another: `openKey` (the rule plus the
 * thing it is about) is unique, and it is cleared only when the alert is
 * resolved. The email and the text go out when the row is created, and never
 * again for that row.
 *
 * ## Two kinds
 *
 * - **urgent**: money is at risk or the shop cannot take payment. Emailed, and
 *   texted to `MALFLEKS_OWNER_PHONE` when text messages are set up.
 * - **routine**: something to look at on the next visit. Emailed only.
 *
 * ## "I'm handling this"
 *
 * An open alert can be marked `handling`. It stays in the list, and a rule
 * that was about to act on the same subject by itself stands back -- the
 * owner has said the decision is his. See `isBeingHandled`.
 *
 * Never throws. A rule that could not tell the owner still did its work.
 */

type Env = Record<string, string | undefined>;

export type AlertUrgency = "urgent" | "routine";

export interface AlertInput {
  /** The rule raising it. */
  key: string;
  /** What it is about (an order id, a branch id). Omit for a problem there is only one of. */
  subjectId?: string;
  urgency: AlertUrgency;
  /** One line. Goes in the email subject and the text message. */
  subject: string;
  /** Plain text, English: what happened, what the site did, what the owner should do. */
  body: string;
  /** A path on the admin site to act on it, e.g. `/admin/orders/abc`. */
  href?: string;
  /** Anything a button on the alert needs to undo or continue the rule's work. */
  data?: Prisma.InputJsonValue;
}

function openKeyFor(key: string, subjectId?: string): string {
  return `${key}:${subjectId ?? "-"}`;
}

/** Plain ASCII and one message long: see `deliveryCodeSms` for why. */
export function alertSms(subject: string): string {
  const ascii = subject
    .normalize("NFKD")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "");
  const text = `MalFleks: ${ascii}`;
  const tail = " Check your email.";
  return text.length + tail.length <= 160 ? text + tail : `${text.slice(0, 160 - tail.length - 3)}...${tail}`;
}

export async function raiseAlert(input: AlertInput, env: Env = process.env): Promise<{ raised: boolean; id: string | null }> {
  const db = getPrisma();
  const openKey = openKeyFor(input.key, input.subjectId);
  let id: string;
  try {
    // `createMany` + `skipDuplicates` rather than catching a unique violation:
    // "already open" is the normal answer here, not an error.
    const { count } = await db.ownerAlert.createMany({
      data: [
        {
          key: input.key,
          openKey,
          urgency: input.urgency,
          subject: input.subject.slice(0, 200),
          body: input.body.slice(0, 4000),
          href: input.href ?? null,
          ...(input.data !== undefined ? { data: input.data } : {}),
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return { raised: false, id: null };
    const row = await db.ownerAlert.findUnique({ where: { openKey }, select: { id: true } });
    if (!row) return { raised: false, id: null };
    id = row.id;
  } catch (error) {
    await logServerError("rules-alert", error);
    return { raised: false, id: null };
  }

  try {
    const adminUrl = resolveAdminUrl(env);
    const lines = [input.body, "", input.href ? `${adminUrl}${input.href}` : `${adminUrl}/admin/rules`];
    const emailed = await sendNotification(`MalFleks${input.urgency === "urgent" ? " — URGENT" : ""}: ${input.subject}`, lines.join("\n"), env);
    if (emailed.sent) {
      await db.ownerAlert.updateMany({ where: { id }, data: { emailedAt: new Date() } });
    } else if (emailed.reason !== "not-configured") {
      await logServerError("rules-alert", new Error(`Could not email the alert "${input.subject}": ${emailed.reason}`));
    }

    if (input.urgency === "urgent") {
      const texted = await sendSms(env.MALFLEKS_OWNER_PHONE, alertSms(input.subject), env);
      if (texted.sent) {
        await db.ownerAlert.updateMany({ where: { id }, data: { textedAt: new Date() } });
      } else if (texted.reason === "rejected" || texted.reason === "failed") {
        await logServerError("rules-alert", new Error(`Could not text the alert "${input.subject}": ${texted.reason} ${texted.detail ?? ""}`));
      }
    }
  } catch (error) {
    await logServerError("rules-alert", error);
  }
  return { raised: true, id };
}

/**
 * The problem went away by itself (ClickPesa answered again, the order was
 * delivered). Closes the open alert for it, if there is one, and frees the key
 * so the same problem can be reported again if it comes back.
 */
export async function resolveAlertFor(key: string, subjectId: string | undefined, by: string): Promise<boolean> {
  try {
    const { count } = await getPrisma().ownerAlert.updateMany({
      where: { openKey: openKeyFor(key, subjectId) },
      data: { status: "resolved", openKey: null, resolvedAt: new Date(), resolvedBy: by },
    });
    return count > 0;
  } catch (error) {
    await logServerError("rules-alert", error);
    return false;
  }
}

/** The owner pressing "Done" on an alert. */
export async function resolveAlert(id: string, by: string): Promise<boolean> {
  const { count } = await getPrisma().ownerAlert.updateMany({
    where: { id, status: { in: ["open", "handling"] } },
    data: { status: "resolved", openKey: null, resolvedAt: new Date(), resolvedBy: by },
  });
  return count === 1;
}

/** The owner pressing "I'm handling this". */
export async function markAlertHandling(id: string): Promise<boolean> {
  const { count } = await getPrisma().ownerAlert.updateMany({ where: { id, status: "open" }, data: { status: "handling" } });
  return count === 1;
}

/** Of these subjects, the ones the owner has said he is handling himself under this rule's alert. */
export async function subjectsBeingHandled(key: string, subjectIds: string[]): Promise<Set<string>> {
  if (subjectIds.length === 0) return new Set();
  const rows = await getPrisma().ownerAlert.findMany({
    where: { status: "handling", openKey: { in: subjectIds.map((s) => openKeyFor(key, s)) } },
    select: { openKey: true },
  });
  const prefix = `${key}:`;
  return new Set(rows.map((r) => (r.openKey ?? "").slice(prefix.length)));
}

export interface AlertRow {
  id: string;
  key: string;
  urgency: string;
  status: string;
  subject: string;
  body: string;
  href: string | null;
  data: Prisma.JsonValue | null;
  createdAt: Date;
  emailedAt: Date | null;
  textedAt: Date | null;
  resolvedAt: Date | null;
}

const ALERT_COLUMNS = {
  id: true,
  key: true,
  urgency: true,
  status: true,
  subject: true,
  body: true,
  href: true,
  data: true,
  createdAt: true,
  emailedAt: true,
  textedAt: true,
  resolvedAt: true,
} as const;

/** Alerts not yet resolved: urgent first, then oldest first. */
export async function openAlerts(): Promise<AlertRow[]> {
  const rows = await getPrisma().ownerAlert.findMany({
    where: { status: { in: ["open", "handling"] } },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: ALERT_COLUMNS,
  });
  return rows.sort((a, b) => Number(b.urgency === "urgent") - Number(a.urgency === "urgent"));
}

export async function recentlyResolvedAlerts(limit = 10): Promise<AlertRow[]> {
  return getPrisma().ownerAlert.findMany({
    where: { status: "resolved" },
    orderBy: { resolvedAt: "desc" },
    take: limit,
    select: ALERT_COLUMNS,
  });
}

/** For the sidebar badge. */
export async function openAlertCount(): Promise<number> {
  return getPrisma().ownerAlert.count({ where: { status: "open" } });
}
