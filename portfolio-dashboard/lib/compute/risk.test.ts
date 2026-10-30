import { describe, expect, it } from "vitest";
import type { Position } from "./portfolio";
import type { TargetView } from "./targets";
import type { TickerMarket } from "@/lib/types";
import { concentration, shocks } from "./risk";

function pos(ticker: string, value: number, total: number, sector = "Tech"): Position {
  return {
    ticker, name: ticker, sector, lots: [], qty: 1, value, cost: null,
    ret: null, w: total ? value / total : 0, dayUsd: 0, day: 0,
  };
}
const view = (ab: number): TargetView => ({
  cons: null, rc: null, spread: 0, k: 0.75, hc: null, ab,
  up: null, upH: null, upL: null, upB: null, age: null, lowc: false, covered: false,
});
const mkt = (hist: [string, number | null, number | null][]): TickerMarket =>
  ({ er: { hist } }) as unknown as TickerMarket;

describe("concentration", () => {
  const ps = [pos("A", 400, 1000), pos("B", 300, 1000), pos("C", 200, 1000), pos("D", 100, 1000)];
  it("concentration flags positions above the limit and sums the excess to bring them to it", () => {
    const r = concentration(ps, 1000, 0.25);
    expect(r.over.map((p) => p.ticker)).toEqual(["A", "B"]);
    expect(r.excess).toBeCloseTo(150 + 50, 9);
  });
  it("a weight exactly at the limit is not over", () => {
    expect(concentration(ps, 1000, 0.4).over).toEqual([]);
    expect(concentration(ps, 1000, 0.4).excess).toBe(0);
  });
  it("top5 with fewer than five positions sums them all", () => {
    expect(concentration(ps, 1000, 0.5).top5).toBeCloseTo(1, 9);
  });
  it("top5 takes the five largest weights", () => {
    const six = [100, 90, 80, 70, 60, 50].map((v, i) => pos("T" + i, v, 450));
    expect(concentration(six, 450, 1).top5).toBeCloseTo(400 / 450, 9);
  });
  it("zero total gives zeros", () => {
    expect(concentration([], 0, 0.1)).toEqual({ over: [], excess: 0, top5: 0 });
  });
});

describe("shocks", () => {
  const total = 1000;
  const ps = [pos("A", 500, total, "Tech"), pos("B", 300, total, "Tech"), pos("C", 200, total, "Energy")];
  const views = { A: view(1.5), B: view(0.5) }; // C has no view -> ab 1
  it("empty portfolio returns no rows", () => {
    expect(shocks([], {}, 0, {})).toEqual([]);
  });
  it("market shock equals -sum(value*ab*0.10)", () => {
    const rows = shocks(ps, views, total, {});
    const m = rows.find((r) => r.label === "Market falls 10%")!;
    expect(m.amount).toBeCloseTo(-(500 * 1.5 + 300 * 0.5 + 200 * 1) * 0.1, 9);
  });
  it("portfolio beta in the note is the weighted adjusted beta", () => {
    const m = shocks(ps, views, total, {}).find((r) => r.label === "Market falls 10%")!;
    expect(m.note).toBe("Using each stock's 1-year beta; portfolio beta 1.10");
  });
  it("largest-holding rows", () => {
    const rows = shocks(ps, views, total, {});
    expect(rows.map((r) => r.label)).toEqual([
      "A falls 10%", "A falls 20%", "Tech falls 20%", "Market falls 10%",
    ]);
    expect(rows[0].amount).toBeCloseTo(-50, 9);
    expect(rows[0].note).toBe("A is 50.0% of the portfolio");
    expect(rows[1].amount).toBeCloseTo(-100, 9);
  });
  it("sector row uses the largest sector", () => {
    const r = shocks(ps, views, total, {})[2];
    expect(r.amount).toBeCloseTo(-160, 9);
    expect(r.note).toBe("2 holdings, 80% of value");
  });
  it("earnings note averages absolute moves, ignoring nulls", () => {
    const r = shocks(ps, views, total, {
      A: mkt([["d1", 1, -6], ["d2", null, 4], ["d3", 2, null], ["d4", 1, 5]]),
    })[1];
    expect(r.note).toBe("Its last four results moved it ±5.0% on average");
  });
  it("earnings note when history is missing", () => {
    expect(shocks(ps, views, total, {})[1].note).toBe("Its earnings reaction is unknown");
    expect(shocks(ps, views, total, { A: mkt([["d", 1, null]]) })[1].note).toBe(
      "Its earnings reaction is unknown",
    );
  });
  it("single sector is still emitted and zero total does not produce NaN", () => {
    const rows = shocks([pos("Z", 0, 0)], {}, 0, {});
    expect(rows).toHaveLength(4);
    for (const r of rows) expect(Number.isFinite(r.amount)).toBe(true);
    expect(rows[3].note).toBe("Using each stock's 1-year beta; portfolio beta 0.00");
  });
});
