// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ageLabel,
  compactNumber,
  dayKey,
  dayLabel,
  formatTZS,
  lastDays,
  niceTicks,
  seriesByDay,
} from "./charts";

describe("dayKey", () => {
  it("files a moment under its East Africa Time day, not its UTC day", () => {
    // 22:30 UTC on 30 Sep is 01:30 on 1 Oct in Dar es Salaam.
    expect(dayKey(new Date("2026-09-30T22:30:00Z"))).toBe("2026-10-01");
    expect(dayKey(new Date("2026-09-30T20:59:00Z"))).toBe("2026-09-30");
  });
});

describe("lastDays", () => {
  it("lists each day once, oldest first, ending today", () => {
    expect(lastDays(new Date("2026-10-01T09:00:00Z"), 3)).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]);
  });
});

describe("seriesByDay", () => {
  const now = new Date("2026-10-01T09:00:00Z");

  it("sums per day and keeps empty days as zero", () => {
    const items = [
      { at: new Date("2026-10-01T06:00:00Z"), amount: 5574 },
      { at: new Date("2026-10-01T08:00:00Z"), amount: 1000 },
      { at: new Date("2026-09-29T10:00:00Z"), amount: 300 },
    ];
    expect(seriesByDay(items, (i) => i.at, (i) => i.amount, now, 3)).toEqual([
      { day: "2026-09-29", value: 300 },
      { day: "2026-09-30", value: 0 },
      { day: "2026-10-01", value: 6574 },
    ]);
  });

  it("ignores anything outside the window", () => {
    const items = [{ at: new Date("2026-08-01T10:00:00Z") }];
    expect(seriesByDay(items, (i) => i.at, () => 1, now, 2).every((p) => p.value === 0)).toBe(true);
  });
});

describe("niceTicks", () => {
  it("steps by 1, 2 or 5 times a power of ten", () => {
    expect(niceTicks(5574)).toEqual([0, 2000, 4000, 6000]);
    expect(niceTicks(3, 4, true)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(7, 4)).toEqual([0, 2, 4, 6, 8]);
  });

  it("never gives a count a fractional tick", () => {
    expect(niceTicks(1, 4, true)).toEqual([0, 1]);
  });

  it("has a sane axis for an all-zero series", () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe("formats", () => {
  it("keeps full digits until ten thousand, then compacts", () => {
    expect(compactNumber(1284)).toBe("1,284");
    expect(compactNumber(12_900)).toBe("12.9K");
    expect(compactNumber(40_000)).toBe("40K");
    expect(compactNumber(4_200_000)).toBe("4.2M");
  });

  it("formats shillings the way the shop does", () => {
    expect(formatTZS(5574)).toBe("TSh 5,574");
  });

  it("labels days and ages for people", () => {
    expect(dayLabel("2026-10-01")).toBe("1 Oct");
    const now = new Date("2026-10-01T12:00:00Z");
    expect(ageLabel(new Date("2026-10-01T11:57:00Z"), now)).toBe("3 min");
    expect(ageLabel(new Date("2026-10-01T07:00:00Z"), now)).toBe("5 h");
    expect(ageLabel(new Date("2026-09-23T20:28:00Z"), now)).toBe("7 d");
  });
});
