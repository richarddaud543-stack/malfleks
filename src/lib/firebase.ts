import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import type { Analytics } from "firebase/analytics";

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
 */
export async function initAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
  if (!config.measurementId || !isFirebaseConfigured()) return null;

  const { getAnalytics, isSupported } = await import("firebase/analytics");
  if (!(await isSupported())) return null;

  return getAnalytics(getFirebaseApp());
}
