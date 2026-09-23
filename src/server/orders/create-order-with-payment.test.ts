// @vitest-environment node
//
// Pure-logic tests for the one function whose output has to be byte-identical
// in two places at once: the `orderReference` sent to ClickPesa, and the
// `OrderPayment.providerRef` stored against it. The webhook
// (src/app/api/payments/clickpesa/route.ts) joins those two by equality, so a
// divergence here means a customer pays and nothing is recorded.

import { describe, expect, it } from "vitest";
import { toClickPesaReference } from "./create-order-with-payment";

describe("toClickPesaReference", () => {
  // ClickPesa: 400 "Invalid Order Reference, should only contain alphanumeric
  // characters". Every MalFleks reference is BRAND-CITY-CODE, so every one of
  // them was rejected until 23 Sep 2026.
  it("strips the hyphens out of a real MalFleks reference", () => {
    expect(toClickPesaReference("ORA-DOD-N6CD")).toBe("ORADODN6CD");
  });

  it("leaves an already-alphanumeric reference untouched", () => {
    expect(toClickPesaReference("ORADODN6CD")).toBe("ORADODN6CD");
  });

  it("removes every non-alphanumeric character, not just hyphens", () => {
    expect(toClickPesaReference("ORA_DOD.N6CD 12")).toBe("ORADODN6CD12");
  });

  it("preserves case, so the stored ref matches what ClickPesa echoes back", () => {
    expect(toClickPesaReference("ora-Dod-n6CD")).toBe("oraDodn6CD");
  });

  // Two different orders must never collapse onto one providerRef, which is
  // @unique in the schema -- a collision would fail the insert after the
  // money was already collectable.
  it("keeps distinct references distinct", () => {
    expect(toClickPesaReference("ORA-DOD-N6CD")).not.toBe(
      toClickPesaReference("ORA-DOD-N6CE"),
    );
  });
});
