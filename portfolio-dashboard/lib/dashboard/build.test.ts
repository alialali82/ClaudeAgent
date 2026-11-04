import { describe, expect, it } from "vitest";
import { deriveTarget } from "@/lib/compute/targets";
import { loadReferenceMarket } from "@/lib/testing/fromReference";
import type { Holding, TickerMarket } from "@/lib/types";
import { buildDashboard, type Dashboard } from "./build";

const EMPTY_BENCH = { SPY: [], QQQ: [] };
const { market: REF } = loadReferenceMarket();
const TODAY = "2026-10-07";

/** Walks the JSON and fails on non-finite numbers or leaked "NaN"/"undefined"/"Infinity" text. */
function assertNoNaN(obj: unknown, path = "$"): void {
  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) throw new Error(`non-finite number at ${path}`);
  } else if (typeof obj === "string") {
    if (/\b(NaN|undefined|Infinity)\b/.test(obj)) throw new Error(`bad text "${obj}" at ${path}`);
  } else if (Array.isArray(obj)) {
    obj.forEach((x, i) => assertNoNaN(x, `${path}[${i}]`));
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) assertNoNaN(v, `${path}.${k}`);
  }
}
const check = (d: Dashboard): Dashboard => {
  assertNoNaN(d);
  return d;
};

const HOLDINGS: Holding[] = [
  { ticker: "NVDA", shares: 100, cost: 100, costKind: "perShare", account: "Brokerage" },
  { ticker: "MU", shares: 10, cost: 5000, costKind: "total", account: "Brokerage" },
  { ticker: "GOOGL", shares: 50, account: "IRA" },
  { ticker: "AMZN", shares: 20, account: "IRA" },
  { ticker: "ADBE", shares: 40, account: "IRA", openDate: "2026-03-02" },
];
const subset = (...t: string[]) => Object.fromEntries(t.map((k) => [k, REF[k]]));
const five = subset("NVDA", "MU", "GOOGL", "AMZN", "ADBE");

describe("buildDashboard synthetic 5-holding portfolio", () => {
  const d = check(buildDashboard(HOLDINGS, five, EMPTY_BENCH, TODAY));

  it("computes exact totals", () => {
    expect(d.total).toBeCloseTo(66642.2, 6);
    expect(d.cost).toBe(15000);
    expect(d.costedValue).toBeCloseTo(34615, 6);
    expect(d.prev).toBeCloseTo(66414.2, 6);
  });

  it("splits accounts", () => {
    const b = d.accounts.find((a) => a.name === "Brokerage")!;
    const i = d.accounts.find((a) => a.name === "IRA")!;
    expect(b.value).toBeCloseTo(34615, 6);
    expect(b.cost).toBe(15000);
    expect(i.value).toBeCloseTo(32027.2, 6);
    expect(i.cost).toBeNull();
  });

  it("orders positions by value descending", () => {
    expect(d.positions.map((p) => p.ticker)).toEqual(["NVDA", "GOOGL", "MU", "ADBE", "AMZN"]);
  });

  it("falls back to today for asof when closes are empty", () => {
    expect(d.asof).toBe(TODAY);
    expect(d.prevAsof).toBe(TODAY);
    expect(d.generatedAt).toBe("2026-10-07T00:00:00Z");
  });

  it("attaches the derived view", () => {
    const v = deriveTarget(REF.NVDA, TODAY);
    const p = d.positions.find((x) => x.ticker === "NVDA")!;
    expect(p.view.cons).toBe(v.cons);
    expect(p.view.hc).toBe(v.hc);
    expect(p.view.covered).toBe(true);
  });

  it("strips closes from position market", () => {
    for (const p of d.positions) expect("closes" in p.market).toBe(false);
  });

  it("market shock is -sum(value*ab*0.10)", () => {
    const expected = -d.positions.reduce((a, p) => a + p.value * p.view.ab * 0.1, 0);
    expect(d.risk.shocks[3].amount).toBeCloseTo(expected, 6);
  });

  it("has four scenarios and a concentration summary", () => {
    expect(d.scenarios).toHaveLength(4);
    expect(d.risk.concentration.limit).toBe(0.15);
    expect(d.risk.concentration.over).toContain("NVDA");
    expect(d.risk.concentration.over.every((t) => typeof t === "string")).toBe(true);
  });

  it("round-trips through JSON", () => {
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });

  it("uses previous targets for change rows without crashing", () => {
    expect(Array.isArray(d.changes)).toBe(true);
  });
});

describe("asof, prevAsof and performance from explicit closes", () => {
  const mk = (t: string, price: number, closes: [string, number][]): TickerMarket => ({
    ...REF.NVDA,
    ticker: t,
    price,
    prevClose: closes.at(-2)![1],
    closes,
  });
  const series = (base: number): [string, number][] => [
    ["2026-10-01", base],
    ["2026-10-02", base + 1],
    ["2026-10-05", base + 2],
    ["2026-10-06", base + 3],
    ["2026-10-07", base + 4],
  ];
  const stale = mk("OLD", 50, [
    ["2026-09-29", 49],
    ["2026-09-30", 50],
  ]);

  it("picks the most common last close date", () => {
    const market = { A: mk("A", 104, series(100)), B: mk("B", 54, series(50)), OLD: stale };
    const d = check(
      buildDashboard(
        [
          { ticker: "A", shares: 1 },
          { ticker: "B", shares: 1 },
          { ticker: "OLD", shares: 1 },
        ],
        market,
        EMPTY_BENCH,
        "2026-10-08",
      ),
    );
    expect(d.asof).toBe("2026-10-07");
    expect(d.prevAsof).toBe("2026-10-06");
  });

  it("builds a performance curve with benchmarks", () => {
    const market = { A: mk("A", 104, series(100)) };
    const bench = { SPY: series(400), QQQ: series(300) };
    const d = check(
      buildDashboard(
        [{ ticker: "A", shares: 2, cost: 190, costKind: "total", openDate: "2026-10-01" }],
        market,
        bench,
        "2026-10-08",
      ),
    );
    expect(d.performance).not.toBeNull();
    const s = d.performance!.series;
    expect(s[0].d).toBe("2026-10-01");
    expect(s.at(-1)).toMatchObject({ d: "2026-10-07", v: 208, c: 190, g: 18 });
    expect(s[0].bSPY).toBeCloseTo(190, 6);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });
});

describe("failures and edge cases", () => {
  it("lists a failed ticker and still computes the rest", () => {
    const hs: Holding[] = [...HOLDINGS, { ticker: "ZZZZ", shares: 5 }];
    const d = check(buildDashboard(hs, five, EMPTY_BENCH, TODAY, { ZZZZ: "unknown" }));
    expect(d.failures).toEqual([{ ticker: "ZZZZ", code: "unknown" }]);
    expect(d.unpriced).toEqual(["ZZZZ"]);
    expect(d.total).toBeCloseTo(66642.2, 6);
  });

  it("a ticker in failed but absent from market does not crash and failures are sorted", () => {
    const d = check(
      buildDashboard([{ ticker: "AAA", shares: 1 }], {}, EMPTY_BENCH, TODAY, { ZZZ: "failed", AAA: "no_price" }),
    );
    expect(d.failures.map((f) => f.ticker)).toEqual(["AAA", "ZZZ"]);
  });

  it("all failed gives an empty dashboard with failures and unpriced", () => {
    const hs: Holding[] = [
      { ticker: "AAA", shares: 1 },
      { ticker: "BBB", shares: 2 },
    ];
    const d = check(buildDashboard(hs, {}, EMPTY_BENCH, TODAY, { AAA: "unknown", BBB: "deadline" }));
    expect(d.total).toBe(0);
    expect(d.positions).toEqual([]);
    expect(d.flags).toEqual([]);
    expect(d.performance).toBeNull();
    expect(d.unpriced).toEqual(["AAA", "BBB"]);
    expect(d.failures).toHaveLength(2);
    expect(d.risk.concentration.over).toEqual([]);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });

  it("empty holdings give a valid empty dashboard", () => {
    const d = check(buildDashboard([], {}, EMPTY_BENCH, TODAY));
    expect(d).toMatchObject({ total: 0, cost: null, costedValue: 0, prev: 0, positions: [], flags: [], performance: null });
    expect(d.calendar).toEqual({ events: [], next14: [] });
    expect(d.scenarios.every((s) => Number.isFinite(s.ret))).toBe(true);
  });

  it("uncovered tickers (no targets) flow through without NaN", () => {
    const m: TickerMarket = { ...REF.NVDA, sp: null, zacks: null, calls: [], prevTargets: undefined };
    const d = check(buildDashboard([{ ticker: "NVDA", shares: 3 }], { NVDA: m }, EMPTY_BENCH, TODAY));
    expect(d.positions[0].view.covered).toBe(false);
    expect(d.positions[0].view.cons).toBeNull();
  });

  it("reports source notes only for tickers with errors", () => {
    const withErr: TickerMarket = { ...REF.MU, errors: { zacks: "timeout", calls: "http_500" } };
    const d = check(
      buildDashboard(
        [
          { ticker: "NVDA", shares: 1 },
          { ticker: "MU", shares: 1 },
        ],
        { NVDA: REF.NVDA, MU: withErr },
        EMPTY_BENCH,
        TODAY,
      ),
    );
    expect(d.sourceNotes).toEqual([{ ticker: "MU", missing: ["calls", "zacks"] }]);
  });
});
