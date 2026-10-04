import type { ReactNode } from "react";

import AdminNav from "@/components/admin/AdminNav";
import SiteFrame from "@/components/layout/SiteFrame";
import { getNavCounts } from "@/server/admin/dashboard";
import { adminSession } from "@/server/auth/admin-session";
import { resolveSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/**
 * The console's frame: sidebar, no shop chrome.
 *
 * `adminSession()` rather than `requireAdmin()`, because a layout must not be
 * the thing that redirects or 404s -- it does not know which page it is
 * wrapping, so it cannot build the right `next=` for sign-in. Instead, a
 * visitor who is not an admin gets the page with no frame at all, and the
 * page's own `requireAdmin()` answers: sign-in for the signed-out, a plain
 * 404 for everyone else. That 404 is drawn inside the shop's own frame
 * (`SiteFrame`), so it looks like every other 404 on the site.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await adminSession();
  // Not an admin: the shop's own frame, in English, around whatever the page
  // answers with -- so its "not found" has the navbar every other one has.
  if (!session) return <SiteFrame locale="en">{children}</SiteFrame>;

  // A count failing (say, the database waking from a pause) must not take the
  // whole console down with it -- the sidebar just loses its badges.
  const counts = await getNavCounts().catch(() => null);

  return (
    <div
      data-admin-shell=""
      className="min-h-dvh bg-[#f4f7f5] text-foreground lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <AdminNav email={session.email} counts={counts} shopUrl={resolveSiteUrl()} />
      <main id="main-content" className="min-w-0 px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-8">{children}</main>
    </div>
  );
}
