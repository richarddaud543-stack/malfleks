import { describe, expect, it } from "vitest";
import { missingConfigKeys } from "./firebase";

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
