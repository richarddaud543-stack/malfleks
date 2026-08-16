// @vitest-environment node

import { readFileSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Security Rules, exercised against the real rules engine.
 *
 * `@firebase/rules-unit-testing` runs only against the local Firebase Emulator
 * Suite and never touches production. The rules text loaded here is the same
 * `firestore.rules` that `firebase deploy` ships, so a rule that passes here and
 * fails in production means the file was edited in the console — which is the
 * argument for never editing it there.
 *
 * Run with:  npm run test:rules
 *
 * **The emulator requires Java.** If it is not running these specs cannot
 * execute, and rather than report a false pass they fail loudly unless
 * `SOKO_ALLOW_MISSING_EMULATOR=1` is set. CI sets nothing, so CI must have the
 * emulator up — see `.github/workflows/ci.yml`. A security suite that
 * silently skips is worse than no suite, because the green tick still appears.
 */

const HOST = process.env.FIRESTORE_EMULATOR_HOST_NAME ?? "127.0.0.1";
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);
const PROJECT_ID = "soko-rules-test";

const OWNER = "customer-owner-uid";
const INTRUDER = "customer-intruder-uid";
const REQUEST_ID = "saved-request-1";

/** A minimal stored request. Shape does not matter to the rules; the path does. */
const STORED = {
  reference: "TOY-DAR-K7M4",
  requestedAt: "2026-08-16T10:00:00.000Z",
  customerId: OWNER,
  quantity: 1,
  lineTotalTZS: 68000000,
};

function emulatorReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: HOST, port: PORT });
    const settle = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1500);
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
    socket.once("timeout", () => settle(false));
  });
}

const reachable = await emulatorReachable();
const allowMissing = process.env.SOKO_ALLOW_MISSING_EMULATOR === "1";

if (!reachable && !allowMissing) {
  describe("Firestore Security Rules", () => {
    it("requires the Firestore emulator to be running", () => {
      expect.fail(
        `The Firestore emulator is not reachable at ${HOST}:${PORT}, so the ` +
          `Security Rules were NOT verified. Start it with ` +
          `\`npm run emulators\` (needs Java 11+), or set ` +
          `SOKO_ALLOW_MISSING_EMULATOR=1 to acknowledge that rules are unverified ` +
          `in this run.`
      );
    });
  });
}

describe.skipIf(!reachable)("Firestore Security Rules", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host: HOST,
        port: PORT,
        rules: readFileSync(
          path.join(process.cwd(), "firestore.rules"),
          "utf8"
        ),
      },
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    // Seeded with rules off, the way the Admin SDK writes in production.
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(
        doc(db, `customers/${OWNER}/orderRequests/${REQUEST_ID}`),
        STORED
      );
      await setDoc(
        doc(db, `customers/${INTRUDER}/orderRequests/other-request`),
        { ...STORED, customerId: INTRUDER }
      );
    });
  });

  const ownerDb = () => env.authenticatedContext(OWNER).firestore();
  const intruderDb = () => env.authenticatedContext(INTRUDER).firestore();
  const anonDb = () => env.unauthenticatedContext().firestore();

  describe("a customer reading their own requests", () => {
    it("can get one", async () => {
      await assertSucceeds(
        getDoc(doc(ownerDb(), `customers/${OWNER}/orderRequests/${REQUEST_ID}`))
      );
    });

    it("can list them", async () => {
      await assertSucceeds(
        getDocs(collection(ownerDb(), `customers/${OWNER}/orderRequests`))
      );
    });
  });

  describe("a customer reaching for somebody else's requests", () => {
    it("cannot get one", async () => {
      // The assignment's hard requirement, stated as a test.
      await assertFails(
        getDoc(
          doc(intruderDb(), `customers/${OWNER}/orderRequests/${REQUEST_ID}`)
        )
      );
    });

    it("cannot list them", async () => {
      await assertFails(
        getDocs(collection(intruderDb(), `customers/${OWNER}/orderRequests`))
      );
    });

    it("cannot reach them through a collection-group query", async () => {
      // The bypass that path-keyed rules invite someone to try: a collection
      // group query addresses every `orderRequests` subcollection at once,
      // under a different match path. There is no rule for that path, so it is
      // denied — but only because we never wrote a `/{path=**}/orderRequests`
      // rule to be "helpful". This test is what stops someone adding one.
      await assertFails(
        getDocs(query(collectionGroup(intruderDb(), "orderRequests")))
      );
    });
  });

  describe("a signed-out visitor", () => {
    it("cannot get a request", async () => {
      await assertFails(
        getDoc(doc(anonDb(), `customers/${OWNER}/orderRequests/${REQUEST_ID}`))
      );
    });

    it("cannot list requests", async () => {
      await assertFails(
        getDocs(collection(anonDb(), `customers/${OWNER}/orderRequests`))
      );
    });
  });

  describe("client writes, including a customer's own", () => {
    it("cannot create a request", async () => {
      // Requests are minted server-side from the catalogue. A client that could
      // create one could name its own price.
      await assertFails(
        setDoc(doc(ownerDb(), `customers/${OWNER}/orderRequests/forged`), STORED)
      );
    });

    it("cannot update one", async () => {
      await assertFails(
        updateDoc(
          doc(ownerDb(), `customers/${OWNER}/orderRequests/${REQUEST_ID}`),
          { lineTotalTZS: 1 }
        )
      );
    });

    it("cannot delete one", async () => {
      await assertFails(
        deleteDoc(doc(ownerDb(), `customers/${OWNER}/orderRequests/${REQUEST_ID}`))
      );
    });

    it("cannot write into another customer's space", async () => {
      await assertFails(
        setDoc(
          doc(intruderDb(), `customers/${OWNER}/orderRequests/forged`),
          STORED
        )
      );
    });
  });

  describe("everything else in the database", () => {
    it("is not readable, signed in or not", async () => {
      await assertFails(getDoc(doc(ownerDb(), "brands/toyota")));
      await assertFails(getDoc(doc(anonDb(), "brands/toyota")));
      await assertFails(getDoc(doc(ownerDb(), `customers/${OWNER}`)));
    });

    it("is not writable, signed in or not", async () => {
      await assertFails(setDoc(doc(ownerDb(), "brands/toyota"), { name: "x" }));
      await assertFails(setDoc(doc(anonDb(), "anything/at-all"), { name: "x" }));
    });
  });
});
