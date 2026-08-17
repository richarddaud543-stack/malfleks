import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import type { Analytics } from "firebase/analytics";
import type { Auth } from "firebase/auth";
import type { AppCheck } from "firebase/app-check";

/**
 * Firebase client setup.
 *
 * Two things the console's copy-paste snippet gets wrong for an App Router app,
 * both of which throw rather than degrade:
 *
 * 1. `initializeApp` at module scope runs again on every hot reload and on every
 *    module graph that imports it, and Firebase throws on a duplicate app. The
 *    `getApps()` guard is the documented fix.
 * 2. `getAnalytics()` needs `window`. Every page here is server-rendered first,
 *    so calling it at import time crashes the render. Analytics is therefore
 *    lazy, async, and gated behind `isSupported()` — see `initAnalytics`.
 *
 * On the config values: a Firebase *web* API key is a public identifier, not a
 * secret. It ships in the client bundle by design and Google documents it as
 * safe to expose. What actually protects the project is Security Rules and App
 * Check, not hiding this string. It lives in env vars so staging and production
 * can differ, not because it is sensitive.
 */

// Referenced one by one on purpose: Next.js inlines `process.env.NEXT_PUBLIC_*`
// by matching the literal text at build time. Reading them through a loop or a
// computed key leaves them `undefined` in the browser bundle.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  // Optional: Analytics is skipped entirely when this is absent.
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/**
 * The reCAPTCHA v3 *site* key for App Check. Public by the same logic as the
 * API key above — a site key is meant to be in the page; the secret half never
 * leaves Google. Absent means App Check is simply not initialised.
 */
const appCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;

/**
 * A debug token registered in the Firebase console, for local development and
 * CI where reCAPTCHA cannot score a real browser. It is per-developer and
 * revocable, and it belongs in `.env.local` only — a debug token committed to
 * the repo would let anyone mint valid App Check tokens.
 */
const appCheckDebugToken = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN;

export type FirebaseConfig = typeof config;

/** The keys Firebase cannot start without. `measurementId` is deliberately out. */
const REQUIRED = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const;

/**
 * Names the missing keys instead of letting Firebase fail later with
 * `auth/invalid-api-key`, which says nothing about which value was absent.
 */
export function missingConfigKeys(candidate: Partial<FirebaseConfig>): string[] {
  return REQUIRED.filter((key) => !candidate[key]).map(
    (key) => `NEXT_PUBLIC_FIREBASE_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`
  );
}

export function isFirebaseConfigured(): boolean {
  return missingConfigKeys(config).length === 0;
}

/**
 * The app instance, created once. Throws with the missing variable names when
 * the environment is incomplete — a build wired to the wrong `.env` should say
 * so loudly at the first call, not half-work in silence.
 */
export function getFirebaseApp(): FirebaseApp {
  const missing = missingConfigKeys(config);
  if (missing.length > 0) {
    throw new Error(
      `Firebase is not configured. Missing: ${missing.join(", ")}. ` +
        `Copy .env.example to .env.local and fill these in.`
    );
  }

  return getApps().length > 0 ? getApp() : initializeApp(config as Required<FirebaseConfig>);
}

/**
 * Analytics, or `null` where it cannot run — server rendering, an unsupported
 * browser, or no `measurementId`. Call it from a client effect, never at module
 * scope. Returning null rather than throwing keeps analytics a non-event for
 * the people it is not available to.
 *
 * **Only call this once the visitor has consented.** The gate is the caller's
 * (`FirebaseAnalytics`, via `src/lib/consent.ts`) and it is deliberately "do
 * not call" rather than Google's consent mode: consent mode's `denied` state
 * still sends cookieless pings, so it means *less* collection, not none.
 * Declining on Soko means this function is never reached, `firebase/analytics`
 * is never imported, and no request leaves the browser.
 *
 * The `setConsent` call below is the belt to that braces. The Analytics SDK
 * documents its own default as **every consent type granted** — so once gtag
 * does load, the ad-related types have to be denied explicitly or they are on.
 * Soko runs no advertising, so they are denied permanently rather than asked
 * about; the banner only ever offers the analytics half.
 */
export async function initAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
  if (!config.measurementId || !isFirebaseConfigured()) return null;

  const { getAnalytics, isSupported, setConsent } = await import(
    "firebase/analytics"
  );
  if (!(await isSupported())) return null;

  setConsent({
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });

  return getAnalytics(getFirebaseApp());
}

// ---------------------------------------------------------------------------
// App Check
// ---------------------------------------------------------------------------

/** Whether an App Check site key was supplied. Exported so the UI can say so. */
export function isAppCheckConfigured(): boolean {
  return Boolean(appCheckSiteKey);
}

let appCheck: AppCheck | null = null;

/**
 * App Check, or `null` where it cannot run.
 *
 * What it does and does not do, because this is routinely overstated: App Check
 * attaches an attestation token proving a request came from *this app on a real
 * browser*, and — once enforcement is switched on per product in the Firebase
 * console — Firebase rejects client-SDK requests that lack one. It does nothing
 * about *authorization*: it proves the caller is our app, never that the caller
 * may read a given document. Security Rules do that.
 *
 * It also covers client-SDK traffic only. Everything this app does server-side
 * runs through the Admin SDK, which bypasses App Check and Security Rules by
 * design. So App Check's real job here is the sign-in path — it is what stops
 * a script hammering Firebase Auth from outside a browser.
 *
 * Enforcement is an operator action in the console and is deliberately not
 * assumed here. Google's guidance is to run in monitor-only mode first and
 * watch the metrics, because enforcing blind locks out real users.
 *
 * Idempotent, and initialised early in the client lifecycle: App Check has to
 * be in place before the SDK calls it protects.
 */
export async function initAppCheck(): Promise<AppCheck | null> {
  if (typeof window === "undefined") return null;
  if (appCheck) return appCheck;
  if (!appCheckSiteKey || !isFirebaseConfigured()) return null;

  const { initializeAppCheck, ReCaptchaV3Provider } = await import(
    "firebase/app-check"
  );

  if (appCheckDebugToken) {
    // Read by the SDK off the global at init time. `true` would ask Firebase to
    // print a fresh token to the console for manual registration; a string
    // uses one already registered.
    (
      globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }
    ).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
  }

  appCheck = initializeAppCheck(getFirebaseApp(), {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });

  return appCheck;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * The Auth instance, browser only.
 *
 * `persistence: NONE` is the deliberate part. Firebase's default is to keep a
 * long-lived session in IndexedDB, which would give this app *two* competing
 * notions of "signed in": the client SDK's, and the server's session cookie.
 * They drift — a revoked or expired cookie leaves the client SDK still cheerily
 * reporting a user — and only one of them can be authoritative on a
 * server-rendered page. Google's session-cookie guide says to make the client's
 * copy disposable for exactly this reason.
 *
 * So the client SDK is used for one thing: proving an identity long enough to
 * hand the server an ID token. After that the cookie is the session.
 */
export async function getFirebaseAuth(): Promise<Auth> {
  const { getAuth, inMemoryPersistence, setPersistence } = await import(
    "firebase/auth"
  );
  const auth = getAuth(getFirebaseApp());
  await setPersistence(auth, inMemoryPersistence);
  // Sends Firebase's own hosted UI (the account chooser) in the device's
  // language rather than always English.
  auth.useDeviceLanguage();
  return auth;
}
