import { describe, it, expect } from "vitest";
import {
  CONSENT_STORAGE_KEY,
  analyticsAllowed,
  clearConsent,
  parseConsent,
  readConsent,
  writeConsent,
  type ConsentStorage,
} from "./consent";

/** A plain in-memory stand-in for `localStorage`. */
function memoryStorage(seed: Record<string, string> = {}): ConsentStorage & {
  data: Record<string, string>;
} {
  const data = { ...seed };
  return {
    data,
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    removeItem: (key: string) => {
      delete data[key];
    },
  };
}

/** Safari in private mode, or a browser with site data blocked. */
function hostileStorage(): ConsentStorage {
  return {
    getItem: () => {
      throw new DOMException("denied", "SecurityError");
    },
    setItem: () => {
      throw new DOMException("denied", "SecurityError");
    },
    removeItem: () => {
      throw new DOMException("denied", "SecurityError");
    },
  };
}

describe("parseConsent", () => {
  it("reads back the two decisions we write", () => {
    expect(parseConsent("granted")).toBe("granted");
    expect(parseConsent("denied")).toBe("denied");
  });

  it("treats anything else as undecided rather than as consent", () => {
    // The direction of this failure is the whole point: a hand-edited value,
    // a key from a future build or a truncated write must never read as a yes.
    for (const raw of ["true", "1", "GRANTED", "yes", "", " granted", null, undefined]) {
      expect(parseConsent(raw)).toBeNull();
    }
  });
});

describe("readConsent", () => {
  it("returns undecided when nothing has been stored", () => {
    expect(readConsent(memoryStorage())).toBeNull();
  });

  it("reads a stored decision from the namespaced key", () => {
    const storage = memoryStorage({ [CONSENT_STORAGE_KEY]: "granted" });
    expect(readConsent(storage)).toBe("granted");
  });

  it("survives a browser that refuses storage, as undecided", () => {
    expect(readConsent(hostileStorage())).toBeNull();
    expect(readConsent(null)).toBeNull();
  });
});

describe("writeConsent", () => {
  it("persists a decision and reports that it stuck", () => {
    const storage = memoryStorage();
    expect(writeConsent(storage, "denied")).toBe(true);
    expect(storage.data[CONSENT_STORAGE_KEY]).toBe("denied");
    expect(readConsent(storage)).toBe("denied");
  });

  it("reports honestly when storage refuses, instead of throwing", () => {
    // The visitor still gets a working site; they are simply asked again next
    // visit, which is the safe direction to fail.
    expect(writeConsent(hostileStorage(), "granted")).toBe(false);
    expect(writeConsent(null, "granted")).toBe(false);
  });
});

describe("clearConsent", () => {
  it("returns the visitor to undecided", () => {
    const storage = memoryStorage({ [CONSENT_STORAGE_KEY]: "granted" });
    clearConsent(storage);
    expect(readConsent(storage)).toBeNull();
  });

  it("does not throw when storage refuses", () => {
    expect(() => clearConsent(hostileStorage())).not.toThrow();
  });
});

describe("analyticsAllowed", () => {
  it("is true only for an explicit grant", () => {
    expect(analyticsAllowed("granted")).toBe(true);
    expect(analyticsAllowed("denied")).toBe(false);
    // Undecided is not consent. This is the default every visitor starts in.
    expect(analyticsAllowed(null)).toBe(false);
  });
});

describe("the storage key", () => {
  it("is namespaced and versioned", () => {
    // Versioned so that widening *what* we ask consent for forces a fresh ask
    // rather than inheriting an old yes given for a narrower purpose.
    expect(CONSENT_STORAGE_KEY).toBe("soko:analytics-consent:v1");
  });
});
