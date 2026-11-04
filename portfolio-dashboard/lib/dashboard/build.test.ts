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
    expect(JSON.parse(JSON.stringify(d))).toStrictEqual(d);
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
    expect(JSON.parse(JSON.stringify(d))).toStrictEqual(d);
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
    expect(JSON.parse(JSON.stringify(d))).toStrictEqual(d);
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

const mkm = (t: string, o: Partial<TickerMarket>): TickerMarket => ({
  ticker: t,
  name: t,
  sector: "Technology",
  price: 100,
  prevClose: 100,
  beta: 1,
  sp: { avg: 120, low: 90, high: 150, n: 30 },
  zacks: null,
  calls: [],
  closes: [],
  errors: {},
  ...o,
});
const h10 = (...ts: string[]): Holding[] => ts.map((ticker) => ({ ticker, shares: 10 }));
const rows = (d: Dashboard, key: string) => d.changes.filter((c) => c.key === key).map((c) => c.text);

describe("change rows from prevTargets", () => {
  const market = {
    // (a) +20% move, no range or status change
    A: mkm("A", { price: 100, prevClose: 99, prevTargets: { sp: { avg: 100, low: 90, high: 150 }, zacks: null } }),
    // (b) +3%: today (106+100)/2 = 103 vs prev (100+94... swapped) = (106+94)/2 = 100
    B: mkm("B", {
      sp: { avg: 106, low: 90, high: 150, n: 30 },
      zacks: { avg: 100, low: 100, high: 100 },
      prevTargets: { sp: { avg: 106, low: 90, high: 150 }, zacks: { avg: 94, low: 94, high: 94 } },
    }),
    // (c) range change only
    C: mkm("C", { sp: { avg: 120, low: 95, high: 150, n: 30 }, prevTargets: { sp: { avg: 120, low: 90, high: 150 }, zacks: null } }),
    // (d) status crossing: prevClose 118 < avg 120 -> price 130 > avg
    D: mkm("D", { price: 130, prevClose: 118, prevTargets: { sp: { avg: 120, low: 90, high: 150 }, zacks: null } }),
    // (e) no prevTargets, and a results date inside 14 days
    E: mkm("E", { price: 100, prevClose: 90, sp: { avg: 80, low: 70, high: 90, n: 30 }, next: { date: "2026-10-12", what: "Q3 results", conf: false } }),
  };
  const d = check(buildDashboard(h10("A", "B", "C", "D", "E"), market, EMPTY_BENCH, TODAY));

  it("(a) a >=5% move gives an exact Target row", () => {
    expect(rows(d, "Target ≥5%")).toEqual(["A Street average $100.00 → $120.00 (+20.0%)."]);
  });
  it("(b) a 1-5% move uses the swapped prev zacks and sp", () => {
    expect(rows(d, "Target moved")).toEqual(["B Street average $100.00 → $103.00 (+3.0%), under the 5% flag."]);
  });
  it("(c) a range change gives a Range row", () => {
    expect(rows(d, "Range")).toEqual(["C target range now $95.00–$150.00 (was $90.00–$150.00)."]);
  });
  it("(d) a status crossing gives a Crossed row", () => {
    expect(rows(d, "Crossed")).toEqual(["D moved from below its average target to above its average target."]);
  });
  it("(e) no prevTargets: no target/range/crossing rows for that ticker, calendar row present", () => {
    for (const c of d.changes) if (c.key !== "Next 14 days" && c.key !== "Targets") expect(c.text.startsWith("E ")).toBe(false);
    expect(rows(d, "Next 14 days")).toHaveLength(1);
    expect(rows(d, "Next 14 days")[0]).toContain("E results");
  });
  it("adds the 'no 5% move' row only when no >=5% row exists", () => {
    expect(rows(d, "Targets")).toEqual([]);
    const d2 = check(buildDashboard(h10("B", "E"), { B: market.B, E: market.E }, EMPTY_BENCH, TODAY));
    expect(rows(d2, "Targets")).toEqual(["No Street average moved 5% or more."]);
    expect(d2.changes[0].key).toBe("Targets");
  });
});

describe("server-computed returns", () => {
  const hs: Holding[] = [
    { ticker: "NVDA", shares: 10, cost: 2000, account: "X" },
    { ticker: "MU", shares: 10, cost: 5000, account: "X" },
    { ticker: "GOOGL", shares: 10, cost: 3000, account: "X" },
    { ticker: "AMZN", shares: 10, account: "X" },
    { ticker: "ADBE", shares: 10, account: "X" },
    { ticker: "ALB", shares: 10, cost: 0, account: "Gift" },
    { ticker: "UBER", shares: 10, account: "None" },
  ];
  const mk = buildDashboard(hs, subset("NVDA", "MU", "GOOGL", "AMZN", "ADBE", "ALB", "UBER"), EMPTY_BENCH, TODAY);
  const d = check(mk);
  const v = (t: string) => REF[t].price * 10;

  it("account ret uses only costed lots (would fail with value/cost-1)", () => {
    const x = d.accounts.find((a) => a.name === "X")!;
    expect(x.cost).toBe(10000);
    expect(x.costedValue).toBeCloseTo(v("NVDA") + v("MU") + v("GOOGL"), 6);
    expect(x.ret).toBeCloseTo((v("NVDA") + v("MU") + v("GOOGL")) / 10000 - 1, 9);
    expect(x.value / 10000 - 1).not.toBeCloseTo(x.ret as number, 3);
  });
  it("sector ret likewise", () => {
    const t = d.sectors.find((s) => s.name === "Technology")!;
    expect(t.cost).toBe(7000);
    expect(t.costedValue).toBeCloseTo(v("NVDA") + v("MU"), 6);
    expect(t.ret).toBeCloseTo((v("NVDA") + v("MU")) / 7000 - 1, 9);
  });
  it("a group whose only costed lot costs 0 has ret null", () => {
    const g = d.accounts.find((a) => a.name === "Gift")!;
    expect(g.cost).toBe(0);
    expect(g.ret).toBeNull();
  });
  it("a group with no costed lots has cost null, costedValue 0, ret null", () => {
    const g = d.accounts.find((a) => a.name === "None")!;
    expect(g.cost).toBeNull();
    expect(g.costedValue).toBe(0);
    expect(g.ret).toBeNull();
  });
  it("top-level ret is over costed lots only", () => {
    expect(d.cost).toBe(10000);
    expect(d.ret).toBeCloseTo((v("NVDA") + v("MU") + v("GOOGL") + v("ALB")) / 10000 - 1, 9);
  });
  it("top-level ret is null with no costs or zero cost", () => {
    expect(check(buildDashboard(h10("NVDA"), subset("NVDA"), EMPTY_BENCH, TODAY)).ret).toBeNull();
    expect(check(buildDashboard([{ ticker: "NVDA", shares: 1, cost: 0 }], subset("NVDA"), EMPTY_BENCH, TODAY)).ret).toBeNull();
    expect(check(buildDashboard([], {}, EMPTY_BENCH, TODAY)).ret).toBeNull();
  });
});
