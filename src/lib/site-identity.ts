import { PROMISE } from "./promise";

/**
 * How MalFleks names and describes itself outside its own pages: the browser
 * tab, a search result, a link pasted into a chat, the home-screen icon.
 *
 * One place, read by the root layout, the web manifest and the structured
 * data, so the three cannot drift apart. Everything here restates the promise
 * agreed on 3 Oct 2026 (`promise.ts`) and nothing beyond it.
 */
export const SITE_NAME = "MalFleks";

/** The tab title of the home page, and what a shared link is headed with. 54 characters. */
export const SITE_TITLE = `${SITE_NAME} — ${PROMISE.headline}`;

/**
 * Under 160 characters with the Swahili line included, so a search result
 * shows the whole of it. The Swahili is the same sentence the pages carry.
 */
export const SITE_DESCRIPTION = `Shop from real shops in Tanzania and pay safely by mobile money. MalFleks holds your payment until your order arrives. ${PROMISE.swahili}`;

/** One line for places with no room for more: the manifest, the organisation record. */
export const SITE_TAGLINE = "Pay safely. Your money is held until your order reaches you.";

/** What the share picture says, for someone who cannot see it. */
export const SITE_SHARE_ALT = `${SITE_NAME} — your money is held until your order arrives. ${PROMISE.swahili}`;
