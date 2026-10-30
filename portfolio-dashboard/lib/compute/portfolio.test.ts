import { describe, expect, it } from "vitest";
import type { Holding, TickerMarket } from "@/lib/types";
import { buildPortfolio } from "./portfolio";

function mk(
  ticker: string,
  price: number,
  prevClose: number,
  sector?: string,
): TickerMarket {
  return {
    ticker,
    name: `${ticker} Inc`,
    sector,
    price,
    prevClose,
    sp: null,
    zacks: null,
    calls: [],
    closes: [],
    errors: {},
  };
}

const market: Record<string, TickerMarket> = {
  AAA: mk("AAA", 100, 90, "Tech"),
  BBB: mk("BBB", 50, 55, "Health"),
  CCC: mk("CCC", 10, 10),
};

const three: Holding[] = [
  { ticker: "AAA", shares: 10, cost: 800, costKind: "total", account: "X" },
  { ticker: "BBB", shares: 20, cost: 40, costKind: "perShare", account: "X" },
  { ticker: "AAA", shares: 5, cost: 90, costKind: "perShare", account: "Y" },
];

describe("buildPortfolio", () => {
  it("total, prev and day change match hand-computed values", () => {
    const p = buildPortfolio(three, market);
    expect(p.lots).toHaveLength(3);
    expect(p.total).toBe(2500); // 1000 + 1000 + 500
    expect(p.prev).toBe(2450); // 900 + 1100 + 450
    expect(p.cost).toBe(2050); // 800 + 800 + 450
    const aaa = p.positions.find((x) => x.ticker === "AAA")!;
    expect(aaa.value).toBe(1500);
    expect(aaa.dayUsd).toBe(150);
    expect(aaa.day).toBeCloseTo(100 / 90 - 1, 12);
    expect(aaa.name).toBe("AAA Inc");
    const bbb = p.positions.find((x) => x.ticker === "BBB")!;
    expect(bbb.dayUsd).toBe(-100);
    expect(bbb.day).toBeCloseTo(50 / 55 - 1, 12);
    expect(p.unpriced).toEqual([]);
  });

  it("same ticker in two accounts merges into one position but keeps two lots", () => {
    const p = buildPortfolio(three, market);
    expect(p.positions).toHaveLength(2);
    const aaa = p.positions[0];
    expect(aaa.ticker).toBe("AAA");
    expect(aaa.lots).toHaveLength(2);
    expect(aaa.qty).toBe(15);
    expect(aaa.cost).toBe(1250);
    expect(aaa.ret).toBeCloseTo(0.2, 12);
    expect(p.accounts).toEqual([
      { name: "X", value: 2000, cost: 1600 },
      { name: "Y", value: 500, cost: 450 },
    ]);
  });

  it("per-share cost is multiplied by shares; total cost used as is", () => {
    const p = buildPortfolio(
      [
        { ticker: "AAA", shares: 10, cost: 80, costKind: "perShare" },
        { ticker: "BBB", shares: 10, cost: 80, costKind: "total" },
        { ticker: "CCC", shares: 10, cost: 80 },
      ],
      market,
    );
    const byT = Object.fromEntries(p.lots.map((l) => [l.ticker, l]));
    expect(byT.AAA.cost).toBe(800);
    expect(byT.AAA.pl).toBe(200);
    expect(byT.AAA.ret).toBeCloseTo(0.25, 12);
    expect(byT.BBB.cost).toBe(80);
    expect(byT.BBB.pl).toBe(420);
    expect(byT.CCC.cost).toBe(80);
  });

  it("missing cost gives ret null and is excluded from portfolio cost", () => {
    const p = buildPortfolio(
      [
        { ticker: "AAA", shares: 10, cost: 800, account: "X" },
        { ticker: "BBB", shares: 20, account: "X" },
      ],
      market,
    );
    const bbb = p.lots.find((l) => l.ticker === "BBB")!;
    expect(bbb.cost).toBeNull();
    expect(bbb.pl).toBeNull();
    expect(bbb.ret).toBeNull();
    expect(p.positions.find((x) => x.ticker === "BBB")!.ret).toBeNull();
    expect(p.positions.find((x) => x.ticker === "BBB")!.cost).toBeNull();
    expect(p.cost).toBe(800);
    expect(p.total).toBe(2000);
  });

  it("position ret only counts lots that have a cost", () => {
    const p = buildPortfolio(
      [
        { ticker: "AAA", shares: 10, cost: 500 },
        { ticker: "AAA", shares: 10 },
      ],
      market,
    );
    expect(p.positions[0].value).toBe(2000);
    expect(p.positions[0].cost).toBe(500);
    expect(p.positions[0].ret).toBeCloseTo(1, 12); // 1000/500 - 1
  });

  it("no cost anywhere gives portfolio cost null and account cost null", () => {
    const p = buildPortfolio([{ ticker: "AAA", shares: 1 }], market);
    expect(p.cost).toBeNull();
    expect(p.accounts).toEqual([{ name: "Portfolio", value: 100, cost: null }]);
  });

  it("ticker without market data lands in unpriced and is excluded from totals", () => {
    const p = buildPortfolio(
      [
        { ticker: "ZZZ", shares: 5, cost: 10 },
        { ticker: "AAA", shares: 1 },
        { ticker: "ZZZ", shares: 3 },
        { ticker: "BAD", shares: 3 },
      ],
      { ...market, BAD: mk("BAD", 0, 1) },
    );
    expect(p.unpriced).toEqual(["ZZZ", "BAD"]);
    expect(p.lots).toHaveLength(1);
    expect(p.positions).toHaveLength(1);
    expect(p.total).toBe(100);
    expect(p.cost).toBeNull();
  });

  it("zero or negative shares are dropped", () => {
    const p = buildPortfolio(
      [
        { ticker: "AAA", shares: 0 },
        { ticker: "BBB", shares: -4 },
        { ticker: "CCC", shares: Number.NaN },
        { ticker: "ZZZ", shares: 0 },
        { ticker: "CCC", shares: 2 },
      ],
      market,
    );
    expect(p.lots).toHaveLength(1);
    expect(p.total).toBe(20);
    expect(p.unpriced).toEqual([]);
  });

  it("fractional shares are kept", () => {
    const p = buildPortfolio([{ ticker: "AAA", shares: 0.5 }], market);
    expect(p.total).toBe(50);
    expect(p.positions[0].qty).toBe(0.5);
  });

  it("empty holdings returns zeros and empty arrays", () => {
    for (const h of [[], [{ ticker: "ZZZ", shares: 1 }]] as Holding[][]) {
      const p = buildPortfolio(h, market);
      expect(p.total).toBe(0);
      expect(p.prev).toBe(0);
      expect(p.cost).toBeNull();
      expect(p.lots).toEqual([]);
      expect(p.positions).toEqual([]);
      expect(p.accounts).toEqual([]);
      expect(p.sectors).toEqual([]);
    }
  });

  it("weights sum to 1", () => {
    const p = buildPortfolio(three, market);
    expect(p.positions.reduce((a, x) => a + x.w, 0)).toBeCloseTo(1, 12);
    expect(p.positions[0].w).toBeCloseTo(0.6, 12);
  });

  it("sectors sorted by value descending, default Other, tickers by value", () => {
    const p = buildPortfolio(
      [
        { ticker: "CCC", shares: 1, cost: 5 },
        { ticker: "BBB", shares: 8 },
        { ticker: "AAA", shares: 1 },
        { ticker: "AAA", shares: 4, cost: 100 },
      ],
      { ...market, DDD: mk("DDD", 20, 20, "Tech") },
    );
    expect(p.sectors.map((s) => s.name)).toEqual(["Tech", "Health", "Other"]);
    expect(p.sectors[0]).toEqual({ name: "Tech", value: 500, cost: 100, tickers: ["AAA"] });
    expect(p.sectors[2]).toEqual({ name: "Other", value: 10, cost: 5, tickers: ["CCC"] });
    const q = buildPortfolio(
      [
        { ticker: "DDD", shares: 1 },
        { ticker: "AAA", shares: 1 },
      ],
      { ...market, DDD: mk("DDD", 20, 20, "Tech") },
    );
    expect(q.sectors[0].tickers).toEqual(["AAA", "DDD"]);
  });

  it("is deterministic for ties by ticker", () => {
    const p = buildPortfolio(
      [
        { ticker: "BBB", shares: 2 },
        { ticker: "CCC", shares: 10 },
        { ticker: "AAA", shares: 1 },
      ],
      market,
    );
    expect(p.positions.map((x) => x.ticker)).toEqual(["AAA", "BBB", "CCC"]);
  });
});
