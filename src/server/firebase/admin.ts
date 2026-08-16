import {
  cert,
  getApps,
  initializeApp,
  applicationDefault,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  adminCredentialSource,
  parseServiceAccountKey,
  resolveProjectId,
  type EnvSource,
} from "./admin-config";

/**
 * The Firebase Admin SDK, server side only.
 *
 * **Import this dynamically.** It pulls in gRPC and protobuf, and the common
 * case on this site is a signed-out visitor who needs none of it. The cheap
 * credential checks live in `./admin-config`, which imports no Firebase code —
 * see that file for why this split exists.
 *
 * Nothing here is imported by a client component. It is server-only by
 * convention rather than by the `server-only` package, matching `src/server/`
 * elsewhere — importing `server-only` breaks these modules under Vitest.
 *
 * Everything degrades rather than throws at import time. Auth is an *addition*
 * to Soko: with no credentials configured the site must still build, still
 * render, and still take a signed-out order request exactly as it did before.
 */

const ADMIN_APP_NAME = "soko-admin";

/**
 * The Admin app, created once. Named rather than default so it can never
 * collide with anything else that calls `initializeApp` in the same process,
 * and looked up by name on re-entry — Next dev reloads this module repeatedly
 * and Firebase throws on a duplicate app.
 */
export function getAdminApp(env: EnvSource = process.env): App {
  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME);
  if (existing) return existing;

  const source = adminCredentialSource(env);
  if (source === "none") {
    throw new Error(
      "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY (the " +
        "contents of a service-account JSON key) or GOOGLE_APPLICATION_CREDENTIALS " +
        "(a path to one). See docs/auth.md. Never commit either."
    );
  }

  if (source === "service-account-json") {
    const key = parseServiceAccountKey(env.FIREBASE_SERVICE_ACCOUNT_KEY as string);
    return initializeApp(
      { credential: cert(key), projectId: key.projectId },
      ADMIN_APP_NAME
    );
  }

  return initializeApp(
    { credential: applicationDefault(), projectId: resolveProjectId(env) },
    ADMIN_APP_NAME
  );
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

let firestore: Firestore | undefined;

export function getAdminFirestore(): Firestore {
  if (!firestore) {
    firestore = getFirestore(getAdminApp());
    // Undefined fields are dropped rather than throwing. Order requests carry
    // several genuinely optional fields (a branch phone number is absent for
    // 15 of 19 branches), and a write that explodes on `undefined` would fail
    // the exact records most likely to matter.
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}
