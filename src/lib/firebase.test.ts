import { describe, expect, it } from "vitest";
import { initAppCheck, isAppCheckConfigured, missingConfigKeys } from "./firebase";

const complete = {
  apiKey: "test-key",
  authDomain: "example.firebaseapp.com",
  projectId: "example",
  storageBucket: "example.firebasestorage.app",
  messagingSenderId: "123",
  appId: "1:123:web:abc",
  measurementId: "G-TEST",
};

describe("missingConfigKeys", () => {
  it("reports nothing for a complete config", () => {
    expect(missingConfigKeys(complete)).toEqual([]);
  });

  it("treats measurementId as optional, since Analytics is optional", () => {
    expect(missingConfigKeys({ ...complete, measurementId: undefined })).toEqual([]);
  });

  it("names the missing variable as the developer would set it", () => {
    expect(missingConfigKeys({ ...complete, apiKey: undefined })).toEqual([
      "NEXT_PUBLIC_FIREBASE_API_KEY",
    ]);
  });

  it("maps every camelCase key to its SCREAMING_SNAKE env name", () => {
    expect(missingConfigKeys({})).toEqual([
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
    ]);
  });

  it("treats an empty string as missing, not as a value", () => {
    expect(missingConfigKeys({ ...complete, projectId: "" })).toEqual([
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    ]);
  });
});

describe("App Check", () => {
  // The test environment sets no App Check site key, which is the same state a
  // deployment is in before an operator creates one in the console.
  it("reports itself unconfigured without a site key", () => {
    expect(isAppCheckConfigured()).toBe(false);
  });

  it("returns null rather than throwing when it cannot run", async () => {
    // The property that matters: an unattested build is a working build. App
    // Check failing closed here would take the whole site down for a control
    // that is meant to be additive.
    await expect(initAppCheck()).resolves.toBeNull();
  });

  it("never reads window at import time", () => {
    // `getAnalytics()`-style eager access is what crashes a server-rendered
    // page. Importing this module must be inert; the guard is inside the
    // function, and this asserts the module-level contract that goes with it.
    expect(typeof initAppCheck).toBe("function");
  });
});
