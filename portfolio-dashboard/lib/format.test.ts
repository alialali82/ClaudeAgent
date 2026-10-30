import { describe, expect, it } from "vitest";
import { daysBetween, fd, pct, sgn0, usd0, usd2 } from "./format";

describe("formatters", () => {
  it("usd0 rounds and signs", () => {
    expect(usd0(1234.5)).toBe("$1,235");
    expect(usd0(-1234)).toBe("−$1,234");
    expect(usd0(0)).toBe("$0");
  });
  it("usd2 always has two decimals", () => {
    expect(usd2(5)).toBe("$5.00");
    expect(usd2(-1234.567)).toBe("−$1,234.57");
  });
  it("sgn0 uses + for >= 0 and U+2212 for negatives", () => {
    expect(sgn0(0)).toBe("+$0");
    expect(sgn0(1500)).toBe("+$1,500");
    expect(sgn0(-1500)).toBe("−$1,500");
  });
  it("pct formats a fraction with sign", () => {
    expect(pct(0.1234)).toBe("+12.3%");
    expect(pct(-0.05)).toBe("−5.0%");
    expect(pct(0)).toBe("+0.0%");
    expect(pct(0.1234, 0)).toBe("+12%");
    expect(pct(-0.01234, 2)).toBe("−1.23%");
  });
  it("non-finite input gives an em dash", () => {
    for (const f of [usd0, usd2, sgn0, pct]) {
      expect(f(NaN)).toBe("—");
      expect(f(Infinity)).toBe("—");
    }
  });
  it("fd formats an ISO date", () => {
    expect(fd("2026-10-07")).toBe("7 Oct");
    expect(fd("2026-01-31")).toBe("31 Jan");
  });
  it("fd returns a dash for invalid dates", () => {
    expect(fd("")).toBe("—");
    expect(fd("garbage")).toBe("—");
    expect(fd("2026-13-45")).toBe("—");
    expect(fd("2026-02-30")).toBe("—");
  });
  it("daysBetween is NaN only for invalid input", () => {
    expect(daysBetween("2026-10-07", "")).toBeNaN();
    expect(daysBetween("2026-10-07", "2026-13-45")).toBeNaN();
  });
  it("daysBetween counts whole UTC days", () => {
    expect(daysBetween("2026-10-07", "2026-10-07")).toBe(0);
    expect(daysBetween("2026-10-07", "2026-10-21")).toBe(14);
    expect(daysBetween("2026-10-07", "2026-10-05")).toBe(-2);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});
