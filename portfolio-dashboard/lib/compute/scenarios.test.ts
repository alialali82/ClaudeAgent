import { describe, expect, it } from "vitest";
import type { Position } from "./portfolio";
import type { TargetView } from "./targets";
import { scenarios } from "./scenarios";

function pos(ticker: string, value: number, qty = 1): Position {
  return {
    ticker, name: ticker, sector: "S", lots: [], qty, value, cost: null,
    ret: null, w: 0, dayUsd: 0, day: 0,
  };
}
const view = (o: Partial<TargetView>): TargetView => ({
  cons: null, rc: null, spread: 0, k: 0.75, hc: null, ab: 1,
  up: null, upH: null, upL: null, upB: null, age: null, lowc: false, covered: true, ...o,
});

describe("scenarios", () => {
  const ps = [pos("A", 600, 6), pos("B", 300, 3), pos("C", 100, 1)];
  const views = {
    A: view({ upL: -0.5, upH: 0.1, up: 0.2, upB: 0.5 }),
    B: view({ upL: 0.1, upH: 0.2, up: 0.3, upB: 0.4 }),
    // C uncovered
  };
  it("emits four rows in order", () => {
    expect(scenarios(ps, views, 1000).map((s) => s.key)).toEqual(["low", "hc", "cons", "high"]);
  });
  it("scenario value is sum of qty*target; uncovered position held at current value", () => {
    const s = scenarios(ps, views, 1000);
    // cons: A 6*(100*1.2)=720, B 3*(100*1.3)=390, C 100
    expect(s[2].value).toBeCloseTo(720 + 390 + 100, 9);
    expect(s[2].ret).toBeCloseTo(0.21, 9);
    expect(s[0].value).toBeCloseTo(300 + 330 + 100, 9);
  });
  it("driver is the biggest absolute contributor, even if negative", () => {
    const s = scenarios(ps, views, 1000);
    expect(s[0].driver.ticker).toBe("A");
    expect(s[0].driver.delta).toBeCloseTo(-300, 9);
    expect(s[3].driver.ticker).toBe("A");
    expect(s[3].driver.delta).toBeCloseTo(300, 9);
  });
  it("ex-largest return excludes the largest holding", () => {
    const s = scenarios(ps, views, 1000);
    // cons: (1210 - 720) / 400 - 1 = 0.225
    expect(s[2].exLargest).toBeCloseTo(0.225, 9);
  });
  it("single-holding portfolio gives null exLargest", () => {
    const s = scenarios([pos("A", 500)], { A: view({ up: 0.1 }) }, 500);
    expect(s[2].exLargest).toBeNull();
    expect(s[2].value).toBeCloseTo(550, 9);
  });
  it("empty portfolio gives four zero rows", () => {
    const s = scenarios([], {}, 0);
    expect(s).toHaveLength(4);
    for (const r of s) {
      expect(r.value).toBe(0);
      expect(r.ret).toBe(0);
      expect(r.driver).toEqual({ ticker: "", delta: 0 });
      expect(r.exLargest).toBeNull();
    }
  });
});
