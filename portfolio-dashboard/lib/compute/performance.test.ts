import { describe, expect, it } from "vitest";
import type { Lot } from "./portfolio";
import { buildPerformance, computeBeta } from "./performance";

type S = [string, number][];

function day(i: number): string {
  const t = Date.UTC(2024, 0, 1) + i * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
/** Closes built from simple returns, starting at 100. */
function fromReturns(rets: number[], start = 100): S {
  const out: S = [[day(0), start]];
  let p = start;
  rets.forEach((r, i) => {
    p *= 1 + r;
    out.push([day(i + 1), p]);
  });
  return out;
}
const spyRets = (n: number) => Array.from({ length: n }, (_, i) => 0.01 * Math.sin(i * 1.7) + 0.002);

describe("computeBeta", () => {
  it("beta of a series equal to 2x SPY returns is 2", () => {
    const r = spyRets(130);
    const spy = fromReturns(r);
    const stock = fromReturns(r.map((x) => 2 * x), 50);
    expect(computeBeta(stock, spy)).toBeCloseTo(2, 9);
  });
  it("beta null with fewer than 120 aligned dates", () => {
    const r = spyRets(118); // 119 dates
    expect(computeBeta(fromReturns(r.map((x) => 2 * x)), fromReturns(r))).toBeNull();
  });
  it("beta ignores non-overlapping dates", () => {
    const r = spyRets(130);
    const spy = fromReturns(r);
    const stock = fromReturns(r.map((x) => 2 * x), 50);
    const extraStock: S = [["2020-01-01", 1], ["2020-01-02", 500], ...stock];
    const extraSpy: S = [...spy, [day(500), 1], [day(501), 9999]];
    expect(computeBeta(extraStock, extraSpy)).toBeCloseTo(2, 9);
  });
  it("beta is null when SPY has zero variance", () => {
    const spy = fromReturns(Array(130).fill(0));
    const stock = fromReturns(spyRets(130));
    expect(computeBeta(stock, spy)).toBeNull();
  });
  it("beta skips non-positive and non-finite closes", () => {
    const r = spyRets(130);
    const spy = fromReturns(r);
    const stock = fromReturns(r.map((x) => 2 * x), 50);
    const bad: S = stock.map((p, i) => (i === 5 ? [p[0], NaN] : i === 9 ? [p[0], 0] : p));
    const b = computeBeta(bad, spy);
    expect(b).not.toBeNull();
    expect(Number.isFinite(b as number)).toBe(true);
  });
});

const lot = (o: Partial<Lot> & { ticker: string }): Lot => ({
  shares: 1, value: 0, prevValue: 0, cost: null, pl: null, ret: null, ...o,
});
const d1 = "2024-03-01", d2 = "2024-03-04", d3 = "2024-03-05";
const flat = (a: number, b: number, c: number): S => [[d1, a], [d2, b], [d3, c]];
const bench = (spy: S = flat(100, 110, 125), qqq: S = flat(50, 50, 100)) => ({ SPY: spy, QQQ: qqq });

describe("buildPerformance", () => {
  it("lot enters on its open date; before that it adds nothing", () => {
    const lots = [
      lot({ ticker: "A", shares: 10, cost: 1000, openDate: d1 }),
      lot({ ticker: "B", shares: 5, cost: 500, openDate: d3 }),
    ];
    const r = buildPerformance(lots, { A: flat(100, 100, 100), B: flat(100, 100, 120) }, bench(), "2024-03-31")!;
    expect(r.series.map((p) => p.d)).toEqual([d1, d2, d3]);
    expect(r.series.map((p) => p.c)).toEqual([1000, 1000, 1500]);
    expect(r.series.map((p) => p.v)).toEqual([1000, 1000, 1000 + 600]);
    expect(r.series.map((p) => p.g)).toEqual([0, 0, 100]);
    expect(r.datedLots).toBe(2);
    expect(r.undatedLots).toBe(0);
  });

  it("undated lots enter at the first date in the series and are counted in undatedLots", () => {
    const lots = [
      lot({ ticker: "A", shares: 10, cost: 1000, openDate: d2 }),
      lot({ ticker: "B", shares: 2, cost: 200 }),
    ];
    const r = buildPerformance(lots, { A: flat(100, 100, 100), B: flat(10, 10, 10) }, bench(), "2024-03-31")!;
    // series starts at d2 (earliest open date); undated lot enters there too
    expect(r.series[0].d).toBe(d2);
    expect(r.series[0].c).toBe(1200);
    expect(r.series[0].v).toBe(1020);
    expect(r.datedLots).toBe(1);
    expect(r.undatedLots).toBe(1);
  });

  it("benchmark invests each cost inflow at that day's close and values at the last close", () => {
    // Inflows: 1000 on d1, 500 on d3.
    // SPY closes 100,110,125: d1 units=1000/100=10 -> 1000; d2 no inflow -> 10*110=1100;
    //   d3 units += 500/125=4 -> 14 -> 14*125=1750.
    // QQQ closes 50,50,100: d1 units=20 -> 1000; d2 -> 1000; d3 units += 500/100=5 -> 25 -> 2500.
    const lots = [
      lot({ ticker: "A", shares: 10, cost: 1000, openDate: d1 }),
      lot({ ticker: "B", shares: 5, cost: 500, openDate: d3 }),
    ];
    const r = buildPerformance(lots, { A: flat(100, 100, 100), B: flat(100, 100, 100) }, bench(), "2024-03-31")!;
    expect(r.series.map((p) => p.bSPY)).toEqual([1000, 1100, 1750]);
    expect(r.series.map((p) => p.bQQQ)).toEqual([1000, 1000, 2500]);
  });

  it("returns null when no lot has a cost", () => {
    const lots = [lot({ ticker: "A", shares: 1, cost: null, openDate: d1 }), lot({ ticker: "A", cost: 0, openDate: d1 })];
    expect(buildPerformance(lots, { A: flat(1, 1, 1) }, bench(), "2024-03-31")).toBeNull();
  });

  it("returns null when no lot has an openDate", () => {
    const lots = [lot({ ticker: "A", cost: 100 })];
    expect(buildPerformance(lots, { A: flat(1, 1, 1) }, bench(), "2024-03-31")).toBeNull();
  });

  it("missing closes for a ticker skip that ticker and list it once", () => {
    const lots = [
      lot({ ticker: "A", shares: 1, cost: 100, openDate: d1 }),
      lot({ ticker: "X", shares: 1, cost: 100, openDate: d1 }),
      lot({ ticker: "Y", shares: 1, cost: 100, openDate: d1 }),
      lot({ ticker: "X", shares: 1, cost: 100, openDate: d2 }),
    ];
    const r = buildPerformance(lots, { A: flat(100, 100, 100), Y: [] }, bench(), "2024-03-31")!;
    expect(r.skipped).toEqual(["X", "Y"]);
    expect(r.datedLots).toBe(1);
    expect(r.series.every((p) => p.c === 100)).toBe(true);
  });

  it("returns null when every participating lot is skipped", () => {
    const lots = [lot({ ticker: "X", cost: 100, openDate: d1 })];
    expect(buildPerformance(lots, {}, bench(), "2024-03-31")).toBeNull();
  });

  it("benchmark is omitted when the bench series starts after the first series date", () => {
    const lots = [lot({ ticker: "A", shares: 1, cost: 100, openDate: d1 })];
    const spy: S = [[d2, 110], [d3, 125]];
    const r = buildPerformance(lots, { A: flat(100, 100, 100) }, bench(spy, []), "2024-03-31")!;
    for (const p of r.series) {
      expect("bSPY" in p).toBe(false);
      expect("bQQQ" in p).toBe(false);
    }
  });

  it("carries forward the last close on a day with no close for a ticker", () => {
    const lots = [
      lot({ ticker: "A", shares: 1, cost: 100, openDate: d1 }),
      lot({ ticker: "B", shares: 2, cost: 100, openDate: d1 }),
    ];
    const B: S = [[d1, 10], [d3, 30]];
    const r = buildPerformance(lots, { A: flat(100, 101, 102), B }, bench(), "2024-03-31")!;
    expect(r.series.map((p) => p.v)).toEqual([120, 101 + 20, 102 + 60]);
  });

  it("lots with an openDate after the last date never enter but still count as dated", () => {
    const lots = [
      lot({ ticker: "A", shares: 1, cost: 100, openDate: d1 }),
      lot({ ticker: "A", shares: 1, cost: 999, openDate: "2025-01-01" }),
    ];
    const r = buildPerformance(lots, { A: flat(100, 100, 100) }, bench(), "2024-03-31")!;
    expect(r.series.every((p) => p.c === 100)).toBe(true);
    expect(r.datedLots).toBe(2);
  });

  it("ignores closes after asof and does not mutate inputs", () => {
    const lots = [lot({ ticker: "A", shares: 1, cost: 100, openDate: d1 })];
    const closes = { A: flat(100, 100, 100) };
    const snap = JSON.stringify([lots, closes]);
    const r = buildPerformance(lots, closes, bench(), d2)!;
    expect(r.series.map((p) => p.d)).toEqual([d1, d2]);
    expect(JSON.stringify([lots, closes])).toBe(snap);
  });
});
