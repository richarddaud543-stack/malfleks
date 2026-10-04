"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * What a page address is reduced to before a visit to it is counted.
 *
 * Vercel Web Analytics records the address of each page viewed. Three kinds of
 * address on this site carry something that points at one person's order --
 * its reference, or its database id -- and none of that is needed to know that
 * "a pay page was opened". The privacy notice says references are removed
 * before counting; this is where that is made true.
 */
const PRIVATE_SEGMENTS: [RegExp, string][] = [
  [/\/pay\/[^/?#]+/, "/pay/[reference]"],
  [/\/track\/[^/?#]+/, "/track/[reference]"],
  [/\/admin\/orders\/[^/?#]+/, "/admin/orders/[id]"],
  [/\/admin\/partners\/[^/?#]+/, "/admin/partners/[id]"],
];

export function redactPrivateUrl(url: string): string {
  let out = url;
  for (const [pattern, replacement] of PRIVATE_SEGMENTS) out = out.replace(pattern, replacement);
  // A sign-in redirect names where to go back to, which can be one of the above.
  return out.replace(/([?&]next=)[^&#]*/, "$1[path]");
}

function beforeSend(event: BeforeSendEvent): BeforeSendEvent {
  return { ...event, url: redactPrivateUrl(event.url) };
}

/** Vercel Web Analytics, with order references taken out of what it records. */
export default function SiteAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
