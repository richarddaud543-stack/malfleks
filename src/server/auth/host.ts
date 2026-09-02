import { headers } from "next/headers";

import { adminRoutesAllowedOn, isAdminHost } from "@/lib/admin-host";

/**
 * The hostname a request arrived on, as the server sees it.
 *
 * `x-forwarded-host` first because that is what Vercel sets — behind the proxy,
 * plain `host` is the internal one and would never match a configured domain.
 * Both are ultimately client-supplied, which matters enormously for building a
 * redirect target and not at all for the comparison this module exists to make:
 * a forged `Host` here can only ever *fail* to match the one configured name.
 * Nobody talks their way into the admin console by claiming to be it.
 */
export async function requestHost(): Promise<string | null> {
  const store = await headers();
  return store.get("x-forwarded-host") ?? store.get("host");
}

/**
 * Does the admin console exist on the host this request came in on?
 *
 * True everywhere when `MALFLEKS_ADMIN_HOST` is unset — see `src/lib/admin-host.ts`
 * for why that direction is the safe one.
 *
 * The environment variable is read here, literally, rather than passed down
 * from a caller: this is server-only code where `process.env` is a live object,
 * so the value tracks the deployment without a rebuild.
 */
export async function adminRoutesAvailable(): Promise<boolean> {
  return adminRoutesAllowedOn(await requestHost(), process.env.MALFLEKS_ADMIN_HOST);
}

/**
 * Is this request on the dedicated admin hostname specifically?
 *
 * Distinct from `adminRoutesAvailable` in the unconfigured case: this one is
 * false when there is no separate admin site, which is what you want before
 * changing how a page presents itself.
 */
export async function onAdminHost(): Promise<boolean> {
  return isAdminHost(await requestHost(), process.env.MALFLEKS_ADMIN_HOST);
}
