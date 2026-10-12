import { describe, expect, it } from "vitest";

import { REPORT } from "@/i18n/copy/report";
import { REPORT_DETAILS_MAX, REPORT_REASONS, validateListingReport } from "./listing-report";

const ok = { productId: "toyota-corolla", reason: "rights", details: "This is my own photo, taken at my shop in 2025." };

describe("a listing report", () => {
  it("is accepted with a reason, a listing and enough words to check", () => {
    const result = validateListingReport(ok);
    expect(result).toEqual({ ok: true, value: ok });
  });

  it("needs one of the reasons the form offers", () => {
    for (const reason of ["", "spam", "RIGHTS"]) {
      const result = validateListingReport({ ...ok, reason });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.reason).toBe("missing");
    }
  });

  it("needs details: not empty, not a word, not an essay", () => {
    const check = (details: string) => {
      const r = validateListingReport({ ...ok, details });
      return r.ok ? null : r.errors.details;
    };
    expect(check("   ")).toBe("missing");
    expect(check("fake")).toBe("too-short");
    expect(check("x".repeat(REPORT_DETAILS_MAX + 1))).toBe("too-long");
    expect(check("x".repeat(REPORT_DETAILS_MAX))).toBeNull();
  });

  it("tidies what it keeps", () => {
    const r = validateListingReport({ ...ok, details: "  line one\r\n\r\n\r\n\r\nline two  " });
    expect(r.ok && r.value.details).toBe("line one\n\nline two");
  });

  it("has words for every reason in both languages", () => {
    for (const reason of REPORT_REASONS) {
      expect(REPORT.en.reasons[reason]).toBeTruthy();
      expect(REPORT.sw.reasons[reason]).toBeTruthy();
    }
  });
});
