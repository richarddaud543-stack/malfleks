"use server";

import { isAdminUser } from "@/server/auth/admin";
import { isAuthConfigured } from "@/server/auth/config";
import { verifySession } from "@/server/auth/dal";

/**
 * "Is the notification setup actually working?" — answered without waiting for
 * a real partner to apply.
 *
 * Notifications are the one part of Soko whose failure is silent by design:
 * `sendNotification` swallows everything so a mail outage can never take an
 * order down with it. That is right, and it means a misconfigured key looks
 * exactly like a working one from the outside — until the day a shop applies,
 * hears nothing, and gives up.
 *
 * The alternative to this button is submitting a fake partner application to
 * production to see whether an email arrives, which leaves a junk row in the
 * review queue forever. This sends the same message down the same path and
 * leaves nothing behind.
 *
 * Admin only, and re-checked here rather than trusting the page: a Server
 * Action is a public HTTP endpoint, and this one spends someone's email quota
 * and reveals which address Soko notifies.
 */

export type NotificationTestResult =
  | { ok: true; provider: string; to: string }
  | {
      ok: false;
      reason: "forbidden" | "not-configured" | "rejected" | "failed";
      provider: string | null;
      to: string | null;
    };

export async function sendTestNotification(): Promise<NotificationTestResult> {
  if (!isAuthConfigured()) {
    return { ok: false, reason: "forbidden", provider: null, to: null };
  }
  const session = await verifySession();
  if (!session || !isAdminUser(session)) {
    return { ok: false, reason: "forbidden", provider: null, to: null };
  }

  const { notifyAddress, notifyProvider, sendNotification } = await import(
    "@/server/notify/email"
  );
  const { resolveSiteUrl } = await import("@/lib/site-url");

  const provider = notifyProvider();
  const to = notifyAddress();

  const outcome = await sendNotification(
    "Soko: notifications are working",
    [
      "This is the test message from /admin.",
      "",
      "If you are reading it, a partner application and a customer order will",
      "both reach you the same way — same provider, same address, same code",
      "path. Nothing else needs checking.",
      "",
      `Site: ${resolveSiteUrl()}`,
    ].join("\n"),
  );

  if (outcome.sent) return { ok: true, provider: provider ?? "unknown", to };
  return { ok: false, reason: outcome.reason, provider, to };
}
