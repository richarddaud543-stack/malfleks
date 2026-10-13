import { describe, expect, it } from "vitest";

import {
  checkDocumentFile,
  DOCUMENT_KINDS,
  DOCUMENT_MIME_TYPES,
  documentExtension,
  isDocumentKind,
  MAX_DOCUMENT_BYTES,
  missingDocumentKinds,
  ownsDocumentPath,
  REQUIRED_DOCUMENT_KINDS,
  requiredDocumentKinds,
  PARTNER_DOCUMENT_BUCKET,
  partnerDocumentPath,
} from "./partner-document";

/**
 * The rules a shop's paperwork must pass.
 *
 * The one that matters most is `ownsDocumentPath`: it is what stops a
 * hand-edited payload attaching somebody else's uploaded trading licence to its
 * own application. The bucket policy is the real guard, but a bucket policy is
 * one dashboard click from being loosened, and this is the second lock.
 */

describe("the bucket", () => {
  it("is the private one, not the product-photos bucket", () => {
    expect(PARTNER_DOCUMENT_BUCKET).toBe("partner-documents");
    expect(PARTNER_DOCUMENT_BUCKET).not.toBe("product-photos");
  });
});

describe("what we accept", () => {
  it("takes photos and PDFs, and nothing that is merely a typed claim", () => {
    expect(DOCUMENT_MIME_TYPES).toContain("image/jpeg");
    expect(DOCUMENT_MIME_TYPES).toContain("application/pdf");
    for (const refused of [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/svg+xml",
      "application/zip",
    ]) {
      expect(DOCUMENT_MIME_TYPES as readonly string[]).not.toContain(refused);
    }
  });

  it("refuses a file of the wrong type", () => {
    expect(checkDocumentFile({ type: "text/plain", size: 100 })).toEqual({
      ok: false,
      reason: "wrong-type",
    });
  });

  it("refuses an empty file", () => {
    expect(checkDocumentFile({ type: "image/png", size: 0 })).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("refuses one past the ceiling but takes one exactly at it", () => {
    expect(checkDocumentFile({ type: "image/png", size: MAX_DOCUMENT_BYTES })).toEqual({ ok: true });
    expect(checkDocumentFile({ type: "image/png", size: MAX_DOCUMENT_BYTES + 1 })).toEqual({
      ok: false,
      reason: "too-big",
    });
  });

  it("has an extension for every accepted type and none for the rest", () => {
    for (const type of DOCUMENT_MIME_TYPES) expect(documentExtension(type)).toBeTruthy();
    expect(documentExtension("text/plain")).toBeNull();
  });
});

describe("isDocumentKind", () => {
  it("accepts the three asked for", () => {
    for (const kind of DOCUMENT_KINDS) expect(isDocumentKind(kind)).toBe(true);
  });

  it("refuses anything else", () => {
    for (const value of ["nida", "id", "", null, undefined, 3, {}]) {
      expect(isDocumentKind(value)).toBe(false);
    }
  });

  it("does not ask for a national ID", () => {
    // The owner chose licence + TIN + shop front on 6 Oct 2026 and left NIDA
    // out on purpose. Adding it back is a decision, not a refactor.
    expect(DOCUMENT_KINDS as readonly string[]).not.toContain("nida");
  });
});

describe("partnerDocumentPath", () => {
  it("puts the uid first, which is what the bucket policy compares", () => {
    const path = partnerDocumentPath({
      uid: "uid-abc",
      applicationId: "app-1",
      kind: "licence",
      mimeType: "image/jpeg",
      stamp: 1700000000000,
    });
    expect(path).toBe("uid-abc/app-1/licence-1700000000000.jpg");
  });

  it("gives a re-upload its own path, so the first attempt survives", () => {
    const base = { uid: "u", applicationId: "a", kind: "licence" as const, mimeType: "image/png" };
    expect(partnerDocumentPath({ ...base, stamp: 1 })).not.toBe(
      partnerDocumentPath({ ...base, stamp: 2 }),
    );
  });

  it("refuses rather than guessing for a type we do not take", () => {
    expect(
      partnerDocumentPath({ uid: "u", applicationId: "a", kind: "tin", mimeType: "text/plain" }),
    ).toBeNull();
  });

  it("refuses a blank uid or application", () => {
    const base = { kind: "tin" as const, mimeType: "image/png" };
    expect(partnerDocumentPath({ ...base, uid: "  ", applicationId: "a" })).toBeNull();
    expect(partnerDocumentPath({ ...base, uid: "u", applicationId: "" })).toBeNull();
  });
});

describe("ownsDocumentPath — the lock that matters", () => {
  it("accepts a path this account actually produced", () => {
    expect(ownsDocumentPath("uid-abc/app-1/licence-1.jpg", "uid-abc")).toBe(true);
  });

  it("refuses another account's path", () => {
    expect(ownsDocumentPath("uid-someone-else/app-9/licence-1.jpg", "uid-abc")).toBe(false);
  });

  it("refuses a path that climbs out of the folder", () => {
    expect(ownsDocumentPath("uid-abc/../uid-other/licence-1.jpg", "uid-abc")).toBe(false);
    expect(ownsDocumentPath("uid-abc/app-1/../../other/x.jpg", "uid-abc")).toBe(false);
  });

  it("refuses a uid that is merely a prefix of the folder", () => {
    // "uid-ab" must not match "uid-abc/..." -- a startsWith check would.
    expect(ownsDocumentPath("uid-abc/app-1/licence-1.jpg", "uid-ab")).toBe(false);
  });

  it("refuses the wrong shape, however plausible", () => {
    for (const path of [
      "licence-1.jpg",
      "uid-abc/licence-1.jpg",
      "uid-abc/app-1/sub/licence-1.jpg",
      "uid-abc/app-1/",
      "/uid-abc/app-1/licence-1.jpg",
    ]) {
      expect(ownsDocumentPath(path, "uid-abc"), path).toBe(false);
    }
  });

  it("refuses a blank uid outright", () => {
    expect(ownsDocumentPath("/app-1/licence-1.jpg", "")).toBe(false);
    expect(ownsDocumentPath("  /app-1/licence-1.jpg", "  ")).toBe(false);
  });
});

describe("missingDocumentKinds", () => {
  it("names all three when nothing has been uploaded", () => {
    expect(missingDocumentKinds([])).toEqual([...REQUIRED_DOCUMENT_KINDS]);
  });

  it("names none when all three are in", () => {
    expect(missingDocumentKinds(REQUIRED_DOCUMENT_KINDS.map((kind) => ({ kind })))).toEqual([]);
  });

  it("names only what is actually absent", () => {
    expect(missingDocumentKinds([{ kind: "licence" }, { kind: "shopfront" }])).toEqual(["tin"]);
  });

  it("ignores a kind we never asked for", () => {
    expect(missingDocumentKinds([{ kind: "nida" }])).toEqual([...REQUIRED_DOCUMENT_KINDS]);
  });

  it("asks a delivery rider for their driving licence, and only that", () => {
    expect(requiredDocumentKinds("courier")).toEqual(["driving"]);
    expect(missingDocumentKinds([], "courier")).toEqual(["driving"]);
    expect(missingDocumentKinds([{ kind: "driving" }], "courier")).toEqual([]);
    // A shop's paperwork is not a rider's licence.
    expect(missingDocumentKinds(REQUIRED_DOCUMENT_KINDS.map((kind) => ({ kind })), "courier")).toEqual(["driving"]);
  });

  it("does not let a driving licence stand in for a shop's documents", () => {
    expect(requiredDocumentKinds("brand")).toEqual(["licence", "tin", "shopfront"]);
    expect(missingDocumentKinds([{ kind: "driving" }], "brand")).toEqual(["licence", "tin", "shopfront"]);
  });
});
