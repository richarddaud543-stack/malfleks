/**
 * How the server decides whether it has Firebase credentials — and nothing else.
 *
 * This module deliberately imports **no** Firebase code. `firebase-admin` is a
 * large dependency that pulls in gRPC and protobuf, and the common case on this
 * site is a signed-out visitor whose session check needs none of it. Keeping the
 * credential question separate lets `verifySession()` answer "nobody is signed
 * in" without loading the SDK at all; `admin.ts` is imported dynamically, only
 * once there is actually a cookie to verify.
 *
 * That is not a micro-optimisation — loading the Admin SDK on the first request
 * to `/api/auth/session` was slow enough to make an E2E assertion flaky.
 *
 * On the credentials themselves: the `NEXT_PUBLIC_FIREBASE_*` web config is a
 * set of public identifiers that ship to every visitor by design. A service
 * account key is the opposite — a private key granting full project access that
 * bypasses both Security Rules and App Check. It never enters the repo, never
 * gets a `NEXT_PUBLIC_` prefix, and appears in `.env.example` only as a
 * placeholder.
 */

/**
 * A bag of environment variables. Deliberately looser than `NodeJS.ProcessEnv`,
 * which requires `NODE_ENV` and so cannot be satisfied by a small object in a
 * test without pretending to be a whole environment.
 */
export type EnvSource = Record<string, string | undefined>;

/** How the operator supplied credentials, or why we have none. */
export type AdminCredentialSource =
  | "service-account-json"
  | "application-default"
  | "none";

/**
 * Where the credential came from.
 *
 * `FIREBASE_SERVICE_ACCOUNT_KEY` holds the *contents* of the downloaded JSON
 * key as a single-line string, which is what a deployment secret store can
 * actually hold. `GOOGLE_APPLICATION_CREDENTIALS` is Google's documented path
 * form and is what a Google-hosted runtime injects for itself.
 */
export function adminCredentialSource(
  env: EnvSource = process.env
): AdminCredentialSource {
  if (env.FIREBASE_SERVICE_ACCOUNT_KEY) return "service-account-json";
  if (env.GOOGLE_APPLICATION_CREDENTIALS) return "application-default";
  // A Google runtime (Cloud Run, App Engine, Cloud Functions) supplies
  // Application Default Credentials without either variable being set.
  if (env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT) {
    return "application-default";
  }
  return "none";
}

/**
 * Whether server-side Firebase is usable at all. Every auth entry point checks
 * this first and reports "sign-in is unavailable" rather than throwing a stack
 * trace at a customer who only wanted to buy a fridge.
 */
export function isAdminConfigured(env: EnvSource = process.env): boolean {
  return adminCredentialSource(env) !== "none";
}

/**
 * The Firebase project id the server should act against. Falls back to the
 * public config so a `GOOGLE_APPLICATION_CREDENTIALS`-only setup still knows
 * which project it is talking to.
 */
export function resolveProjectId(env: EnvSource): string | undefined {
  return (
    env.FIREBASE_PROJECT_ID ||
    env.GOOGLE_CLOUD_PROJECT ||
    env.GCLOUD_PROJECT ||
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    undefined
  );
}

/**
 * Parses the JSON service account key. Exported separately so the failure mode
 * — a secret pasted with literal `\n` escapes instead of real newlines, which is
 * the single most common way this breaks — is testable without a real key.
 */
export function parseServiceAccountKey(raw: string): {
  projectId: string;
  clientEmail: string;
  privateKey: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON. It must hold the whole " +
        "downloaded service-account file, not a path to it."
    );
  }

  const value = parsed as Record<string, unknown>;
  const projectId = value.project_id ?? value.projectId;
  const clientEmail = value.client_email ?? value.clientEmail;
  const privateKey = value.private_key ?? value.privateKey;

  if (
    typeof projectId !== "string" ||
    typeof clientEmail !== "string" ||
    typeof privateKey !== "string"
  ) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is missing project_id, client_email or " +
        "private_key. Re-download it from Project settings → Service accounts."
    );
  }

  return {
    projectId,
    clientEmail,
    // A key pasted into a .env file or a secrets UI usually arrives with the
    // newlines escaped. Firebase then fails deep inside the crypto layer with
    // an error that names neither the variable nor the cause.
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}
