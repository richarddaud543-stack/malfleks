// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ClickPesaPaymentRecord } from "./clickpesa";
import {
  decideSettlement,
  isDueForCheck,
  RECONCILE_WINDOW_DAYS,
  withinReconcileWindow,
} from "./reconcile-rules";

const record = (overrides: Partial<ClickPesaPaymentRecord>): ClickPesaPaymentRecord => ({
  status: "PENDING",
  paymentReference: null,
  orderReference: "ORADODN6CD",
  collectedAmount: null,
  message: null,
  updatedAt: null,
  ...overrides,
});

describe("decideSettlement", () => {
  it("captures a SUCCESS with its amount and reference", () => {
    expect(
      decideSettlement([
        record({ status: "SUCCESS", collectedAmount: 5574, paymentReference: "CP1" }),
      ]),
    ).toEqual({
      action: "capture",
      paymentReference: "CP1",
      collectedAmount: 5574,
      providerStatus: "SUCCESS",
    });
  });

  it("treats SETTLED as collected too", () => {
    expect(
      decideSettlement([record({ status: "SETTLED", collectedAmount: 5574 })]).action,
    ).toBe("capture");
  });

  it("lets any success win over a failed attempt beside it", () => {
    const decision = decideSettlement([
      record({ status: "FAILED", updatedAt: "2026-10-01T09:00:00Z" }),
      record({
        status: "SUCCESS",
        collectedAmount: 5574,
        paymentReference: "RETRY",
        updatedAt: "2026-10-01T09:05:00Z",
      }),
    ]);
    expect(decision).toMatchObject({ action: "capture", paymentReference: "RETRY" });
  });

  it("uses the latest success when there are several", () => {
    const decision = decideSettlement([
      record({ status: "SUCCESS", collectedAmount: 5574, paymentReference: "OLD", updatedAt: "2026-10-01T08:00:00Z" }),
      record({ status: "SUCCESS", collectedAmount: 5574, paymentReference: "NEW", updatedAt: "2026-10-01T09:00:00Z" }),
    ]);
    expect(decision).toMatchObject({ paymentReference: "NEW" });
  });

  it("waits on a success with no readable amount rather than trusting it", () => {
    expect(decideSettlement([record({ status: "SUCCESS", collectedAmount: null })])).toEqual({
      action: "wait",
      providerStatus: "SUCCESS_WITHOUT_AMOUNT",
    });
  });

  it("never decides failed -- an all-FAILED history only waits", () => {
    expect(decideSettlement([record({ status: "FAILED" }), record({ status: "FAILED" })])).toEqual({
      action: "wait",
      providerStatus: "FAILED",
    });
  });

  it("reports the latest in-flight status while waiting", () => {
    expect(
      decideSettlement([
        record({ status: "FAILED", updatedAt: "2026-10-01T08:00:00Z" }),
        record({ status: "PROCESSING", updatedAt: "2026-10-01T09:00:00Z" }),
      ]),
    ).toEqual({ action: "wait", providerStatus: "PROCESSING" });
  });

  it("says NO_ATTEMPTS for an empty list", () => {
    expect(decideSettlement([])).toEqual({ action: "wait", providerStatus: "NO_ATTEMPTS" });
  });
});

describe("isDueForCheck", () => {
  const now = new Date("2026-10-01T12:00:00Z");

  it("is due when never checked", () => {
    expect(isDueForCheck(null, now, 30)).toBe(true);
  });

  it("is not due inside the window, and due at its edge", () => {
    expect(isDueForCheck(new Date("2026-10-01T11:31:00Z"), now, 30)).toBe(false);
    expect(isDueForCheck(new Date("2026-10-01T11:30:00Z"), now, 30)).toBe(true);
  });
});

describe("withinReconcileWindow", () => {
  const now = new Date("2026-10-31T12:00:00Z");

  it("covers the last RECONCILE_WINDOW_DAYS and nothing older", () => {
    const edge = new Date(now.getTime() - RECONCILE_WINDOW_DAYS * 86_400_000);
    expect(withinReconcileWindow(edge, now)).toBe(true);
    expect(withinReconcileWindow(new Date(edge.getTime() - 1), now)).toBe(false);
  });
});
