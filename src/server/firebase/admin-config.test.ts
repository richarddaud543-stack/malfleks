// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  adminCredentialSource,
  isAdminConfigured,
  parseServiceAccountKey,
} from "./admin-config";

describe("adminCredentialSource", () => {
  it("prefers an inline JSON key, which is what a secret store can hold", () => {
    expect(adminCredentialSource({ FIREBASE_SERVICE_ACCOUNT_KEY: "{}" })).toBe(
      "service-account-json"
    );
  });

  it("accepts Google's documented path form", () => {
    expect(
      adminCredentialSource({ GOOGLE_APPLICATION_CREDENTIALS: "/keys/sa.json" })
    ).toBe("application-default");
  });

  it("recognises a Google runtime that injects its own credentials", () => {
    expect(adminCredentialSource({ GOOGLE_CLOUD_PROJECT: "v-mall-f37c6" })).toBe(
      "application-default"
    );
  });

  it("reports none when nothing is configured", () => {
    expect(adminCredentialSource({})).toBe("none");
  });

  it("does not treat the public web config as a server credential", () => {
    // The single most important negative case in this file. A NEXT_PUBLIC_ key
    // is an identifier every visitor already has; if it ever satisfied this
    // check, the server would try to act with no real credential at all.
    expect(
      adminCredentialSource({
        NEXT_PUBLIC_FIREBASE_API_KEY: "AIza-not-a-secret",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "v-mall-f37c6",
      })
    ).toBe("none");
  });

  it("drives isAdminConfigured", () => {
    expect(isAdminConfigured({})).toBe(false);
    expect(isAdminConfigured({ FIREBASE_SERVICE_ACCOUNT_KEY: "{}" })).toBe(true);
  });
});

describe("parseServiceAccountKey", () => {
  // Structurally shaped like a real key, with an obviously fake body. Nothing
  // here is a credential and nothing here works against any project.
  const key = JSON.stringify({
    type: "service_account",
    project_id: "example-project",
    client_email: "example@example-project.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\\nNOT-A-REAL-KEY\\n-----END PRIVATE KEY-----\\n",
  });

  it("un-escapes the newlines a .env file leaves behind", () => {
    // The single most common way this breaks in the wild: the key survives
    // JSON.parse with literal backslash-n, and Firebase then fails deep in the
    // crypto layer with an error that names neither the variable nor the cause.
    const parsed = parseServiceAccountKey(key);
    expect(parsed.privateKey).toContain("\n");
    expect(parsed.privateKey).not.toContain("\\n");
    expect(parsed.privateKey.split("\n").length).toBeGreaterThan(2);
  });

  it("reads the identity fields", () => {
    const parsed = parseServiceAccountKey(key);
    expect(parsed.projectId).toBe("example-project");
    expect(parsed.clientEmail).toBe(
      "example@example-project.iam.gserviceaccount.com"
    );
  });

  it("says so when given a path instead of the file's contents", () => {
    expect(() => parseServiceAccountKey("/keys/sa.json")).toThrow(
      /not valid JSON/
    );
  });

  it("names the missing fields rather than failing later", () => {
    expect(() => parseServiceAccountKey('{"project_id":"x"}')).toThrow(
      /client_email/
    );
  });

  it("accepts the camelCase spelling some tooling emits", () => {
    const camel = JSON.stringify({
      projectId: "example-project",
      clientEmail: "example@example-project.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\\nNOT-A-REAL-KEY\\n-----END PRIVATE KEY-----\\n",
    });
    expect(parseServiceAccountKey(camel).projectId).toBe("example-project");
  });
});
