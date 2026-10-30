import { describe, expect, it } from "vitest";
import { buildChanges, buildFlags, type Flag } from "./flags";
import { buildCalendar } from "./calendar";
import type { Position } from "./portfolio";
import type { TargetView } from "./targets";
import type { TickerMarket } from "@/lib/types";

const pos = (ticker: string, over: Partial<Position> = {}): Position => ({
  ticker,
  name: ticker,
  sector: "Tech",
  lots: [],
  qty: 10,
  value: 1000,
  cost: null,
  ret: null,
  w: 0.1,
  dayUsd: 0,
  day: 0,
  ...over,
});

const mk = (ticker: string, over: Partial<TickerMarket> = {}): TickerMarket => ({
  ticker,
  name: ticker,
  price: 100,
  prevClose: 100,
  sp: { avg: 120, low: 90, high: 150, n: 30 },
  zacks: null,
  calls: [],
  closes: [],
  errors: {},
  ...over,
});

const view = (over: Partial<TargetView> = {}): TargetView => ({
  cons: 120,
  rc: null,
  spread: 0.1,
  k: 0.75,
  hc: null,
  ab: 0,
  up: 0.2,
  upH: 0.5,
  upL: -0.1,
  upB: 0.1,
  age: 0,
  lowc: false,
  covered: true,
  ...over,
});

const TODAY = "2026-10-07";
const cal = (p: Position[], m: Record<string, TickerMarket>) => buildCalendar(p, m, TODAY);
const find = (fl: Flag[], k: string) => fl.find((f) => f.key === k);

describe("buildFlags", () => {
  it("returns no flags for an empty portfolio", () => {
    expect(buildFlags([], {}, {}, cal([], {}), 0)).toEqual([]);
  });

  it("phrases results today / tomorrow / in N days and strips the what prefix", () => {
    const p = [pos("AAA", { value: 2000, qty: 7 }), pos("BBB"), pos("CCC")];
    const m = {
      AAA: mk("AAA", { next: { date: "2026-10-07", what: "Q3 results, after close", conf: true } }),
      BBB: mk("BBB", { next: { date: "2026-10-08", what: "Q3 results", conf: true } }),
      CCC: mk("CCC", { next: { date: "2026-10-12", what: "Q3 RESULTS call", conf: true } }),
    };
    const v = { AAA: view(), BBB: view(), CCC: view() };
    const fl = buildFlags(p, v, m, cal(p, m), 4000).filter((f) => f.key === "Results");
    expect(fl.map((f) => f.tone)).toEqual(["hot", "hot", "hot"]);
    expect(fl[0].text).toBe(
      "AAA reports today (7 Oct, after close). A 10% move is ±$200 on your 7 shares.",
    );
    expect(fl[1].text).toBe(
      "BBB reports tomorrow (8 Oct, date set). A 10% move is ±$100 on your 10 shares.",
    );
    expect(fl[2].text).toBe(
      "CCC reports in 5 days (12 Oct, call). A 10% move is ±$100 on your 10 shares.",
    );
  });

  it("flags below every target when price < low", () => {
    const p = [pos("AAA", { value: 500 }), pos("BBB", { value: 300 }), pos("CCC")];
    const m = {
      AAA: mk("AAA", { price: 80 }),
      BBB: mk("BBB", { price: 85 }),
      CCC: mk("CCC", { price: 90 }),
    };
    const v = { AAA: view(), BBB: view(), CCC: view() };
    const f = find(buildFlags(p, v, m, cal(p, m), 4000), "Below every target");
    expect(f?.tone).toBe("cold");
    expect(f?.text).toContain("AAA, BBB trade below their lowest published target");
    expect(f?.text).toContain("$800, 20.0% of the portfolio.");
    expect(f?.text).not.toContain("CCC");
  });

  it("separates above-the-highest from above-the-average", () => {
    const p = [pos("AAA"), pos("BBB"), pos("CCC")];
    const m = {
      AAA: mk("AAA", { price: 160 }),
      BBB: mk("BBB", { price: 130 }),
      CCC: mk("CCC", { price: 100 }),
    };
    const v = { AAA: view({ up: -0.3 }), BBB: view({ up: -0.05 }), CCC: view({ up: 0.2 }) };
    const f = find(buildFlags(p, v, m, cal(p, m), 3000), "Above the Street");
    expect(f?.tone).toBe("hot");
    expect(f?.text).toBe("AAA above the highest target; BBB above the average.");
  });

  it("writes the concentration text, with Street gap only when up is known", () => {
    const p = [
      pos("AAA", { value: 5000, w: 0.5 }),
      pos("BBB", { value: 2000, w: 0.2 }),
      pos("CCC", { value: 1000, w: 0.1 }),
      pos("DDD", { value: 1000, w: 0.1 }),
      pos("EEE", { value: 500, w: 0.05 }),
      pos("FFF", { value: 500, w: 0.05 }),
    ];
    const m: Record<string, TickerMarket> = {};
    const v: Record<string, TargetView> = {};
    for (const x of p) {
      m[x.ticker] = mk(x.ticker);
      v[x.ticker] = view({ up: x.ticker === "AAA" ? 0.123 : 0.2 });
    }
    let f = find(buildFlags(p, v, m, cal(p, m), 10000), "Concentration");
    expect(f?.tone).toBe("info");
    expect(f?.text).toBe(
      "AAA is 50.0% of the portfolio; the top five are 95%. Its Street average is only +12.3% away.",
    );
    v.AAA = view({ up: null });
    f = find(buildFlags(p, v, m, cal(p, m), 10000), "Concentration");
    expect(f?.text).toBe("AAA is 50.0% of the portfolio; the top five are 95%.");
  });

  it("flags diverging targets only above 10%", () => {
    const p = [pos("AAA"), pos("BBB"), pos("CCC")];
    const m = {
      AAA: mk("AAA", { sp: { avg: 100, low: 50, high: 200, n: 30 } }),
      BBB: mk("BBB", { sp: { avg: 100, low: 50, high: 200, n: 30 } }),
      CCC: mk("CCC", { sp: { avg: 100, low: 50, high: 200, n: 30 } }),
    };
    const v = {
      AAA: view({ rc: 110 }), // exactly 10%: not flagged
      BBB: view({ rc: 120 }),
      CCC: view({ rc: 80 }),
    };
    const f = find(buildFlags(p, v, m, cal(p, m), 3000), "Targets diverge");
    expect(f?.tone).toBe("info");
    expect(f?.text).toContain("BBB (+20%), CCC (−20%)");
    expect(f?.text).not.toContain("AAA (");
  });

  it("emits weak targets only when non-empty", () => {
    const p = [pos("AAA"), pos("BBB")];
    const m = { AAA: mk("AAA"), BBB: mk("BBB") };
    expect(find(buildFlags(p, { AAA: view(), BBB: view() }, m, cal(p, m), 2000), "Weak targets")).toBeUndefined();
    const f = find(buildFlags(p, { AAA: view(), BBB: view({ lowc: true }) }, m, cal(p, m), 2000), "Weak targets");
    expect(f?.text).toContain("BBB");
    expect(f?.text).not.toContain("AAA");
  });

  it("skips positions with missing view or market", () => {
    const p = [pos("AAA"), pos("BBB")];
    const m = { AAA: mk("AAA", { price: 10 }) };
    const fl = buildFlags(p, { BBB: view() }, m, cal(p, m), 2000);
    expect(find(fl, "Below every target")).toBeUndefined();
  });
});

describe("buildChanges", () => {
  const p = [pos("AAA", { lots: [{ ticker: "AAA", shares: 10, account: "ISA", cost: 1000, value: 0, prevValue: 0, pl: null, ret: null }] })];
  const noCal = buildCalendar([], {}, TODAY);

  it("reports a 5% move as Target ≥5%", () => {
    const m = { AAA: mk("AAA") };
    const ch = buildChanges(p, m, { AAA: view({ cons: 126 }) }, { AAA: view({ cons: 120 }) }, noCal);
    expect(ch.find((c) => c.key === "Target ≥5%")?.text).toBe(
      "AAA Street average $120.00 → $126.00 (+5.0%).",
    );
    expect(ch.find((c) => c.key === "Targets")).toBeUndefined();
  });

  it("reports a 3% move as Target moved", () => {
    const m = { AAA: mk("AAA") };
    const ch = buildChanges(p, m, { AAA: view({ cons: 103 }) }, { AAA: view({ cons: 100 }) }, noCal);
    expect(ch.find((c) => c.key === "Target moved")?.text).toBe(
      "AAA Street average $100.00 → $103.00 (+3.0%), under the 5% flag.",
    );
    expect(ch[0]).toEqual({ key: "Targets", text: "No Street average moved 5% or more." });
  });

  it("reports status crossing when price crosses the average", () => {
    const m = { AAA: mk("AAA", { price: 125, prevClose: 115 }) };
    const v = { AAA: view({ cons: 120 }) };
    const ch = buildChanges(p, m, v, v, noCal);
    expect(ch.find((c) => c.key === "Crossed")?.text).toBe(
      "AAA moved from below its average target to above its average target.",
    );
  });

  it("reports range changes unless modeled", () => {
    const prevTargets = { sp: { avg: 120, low: 85, high: 150, n: 30 }, zacks: null };
    const v = { AAA: view() };
    let ch = buildChanges(p, { AAA: mk("AAA", { prevTargets }) }, v, v, noCal);
    expect(ch.find((c) => c.key === "Range")?.text).toBe(
      "AAA target range now $90.00–$150.00 (was $85.00–$150.00).",
    );
    ch = buildChanges(p, { AAA: mk("AAA", { prevTargets, modeled: true }) }, v, v, noCal);
    expect(ch.find((c) => c.key === "Range")).toBeUndefined();
  });

  it("reports cost crossing with the account label", () => {
    // avg cost 100/share; price moves from 99 to 101
    const m = { AAA: mk("AAA", { price: 101, prevClose: 99 }) };
    const v = { AAA: view() };
    const ch = buildChanges(p, m, v, v, noCal);
    expect(ch.find((c) => c.key === "Cost")?.text).toBe("AAA (ISA) is now above your $100.00 cost.");
    const down = buildChanges(p, { AAA: mk("AAA", { price: 99, prevClose: 101 }) }, v, v, noCal);
    expect(down.find((c) => c.key === "Cost")?.text).toBe("AAA (ISA) is now below your $100.00 cost.");
  });

  it("unchanged prices give only Targets and Next 14 days", () => {
    const m = { AAA: mk("AAA", { prevTargets: { sp: { avg: 120, low: 90, high: 150, n: 30 }, zacks: null } }) };
    const v = { AAA: view() };
    expect(buildChanges(p, m, v, v, noCal)).toEqual([
      { key: "Targets", text: "No Street average moved 5% or more." },
      { key: "Next 14 days", text: "No results scheduled." },
    ]);
  });

  it("lists upcoming results in Next 14 days", () => {
    const m = {
      AAA: mk("AAA", { next: { date: "2026-10-09", what: "results", conf: true } }),
    };
    const c = buildCalendar(p, m, TODAY);
    const ch = buildChanges(p, m, {}, {}, c);
    expect(ch.at(-1)).toEqual({ key: "Next 14 days", text: "AAA results 9 Oct." });
  });

  it("with empty prevViews only cost and next-14 rows plus Targets", () => {
    const m = { AAA: mk("AAA", { price: 101, prevClose: 99 }) };
    const ch = buildChanges(p, m, { AAA: view() }, {}, noCal);
    expect(ch.map((c) => c.key)).toEqual(["Targets", "Cost", "Next 14 days"]);
  });

  it("a blank results date yields no Results flag and no NaN text", () => {
    const m = { AAA: mk("AAA", { next: { date: "", what: "results", conf: true } }) };
    const c = buildCalendar(p, m, TODAY);
    const fl = buildFlags(p, { AAA: view() }, m, c, 1000);
    expect(find(fl, "Results")).toBeUndefined();
    const ch = buildChanges(p, m, { AAA: view() }, {}, c);
    expect(ch.at(-1)).toEqual({ key: "Next 14 days", text: "No results scheduled." });
    expect(JSON.stringify([fl, ch])).not.toMatch(/NaN|undefined/);
  });
});
