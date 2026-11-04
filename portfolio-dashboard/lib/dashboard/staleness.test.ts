import { describe, expect, it } from "vitest";
import { tradingDaysBehind } from "./staleness";

describe("tradingDaysBehind", () => {
  it.each([
    ["2026-10-07", "2026-10-07", 0], // same day
    ["2026-10-07", "2026-10-08", 0], // today's close is not in yet
    ["2026-10-07", "2026-10-09", 1], // Thursday missing
    ["2026-10-07", "2026-10-12", 2], // Thu + Fri, weekend skipped
    ["2026-10-09", "2026-10-12", 0], // Friday close seen on Monday
    ["2026-10-09", "2026-10-13", 1], // Monday missing
    ["2026-10-07", "2026-10-01", 0], // device date before the data
  ])("asof %s on %s -> %i", (asof, today, n) => {
    expect(tradingDaysBehind(asof, today)).toBe(n);
  });

  it("is 0 for invalid dates", () => {
    expect(tradingDaysBehind("nope", "2026-10-09")).toBe(0);
    expect(tradingDaysBehind("2026-10-07", "")).toBe(0);
  });
});
