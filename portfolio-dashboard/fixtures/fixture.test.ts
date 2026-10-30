import { describe, expect, it } from "vitest";
import fixture from "./market-2026-10-07.json";

function hasKey(value: unknown, forbidden: Set<string>): boolean {
  if (Array.isArray(value)) return value.some((v) => hasKey(v, forbidden));
  if (value && typeof value === "object") {
    return Object.entries(value).some(
      ([k, v]) => forbidden.has(k) || hasKey(v, forbidden),
    );
  }
  return false;
}

describe("market-2026-10-07 fixture", () => {
  it("has exactly asof, prevAsof and tickers at top level", () => {
    expect(Object.keys(fixture).sort()).toEqual(["asof", "prevAsof", "tickers"]);
    expect(fixture.asof).toBe("2026-10-07");
  });

  it("contains no positions, history or note keys anywhere", () => {
    expect(hasKey(fixture, new Set(["positions", "history", "note"]))).toBe(false);
  });

  it("preserves NVDA and ADBE reference values", () => {
    const t = fixture.tickers;
    expect(t.NVDA.price).toBe(237.37);
    expect(t.NVDA.n).toBe(61);
    expect(t.NVDA.cons).toBe(328.72);
    expect(t.NVDA.zacks.cons).toBe(324.2);
    expect(t.NVDA.calls).toHaveLength(9);
    expect(t.ADBE.price).toBe(232.73);
    expect(t.ADBE.n).toBe(39);
    expect(t.ADBE.beta).toBe(0.36);
  });
});
