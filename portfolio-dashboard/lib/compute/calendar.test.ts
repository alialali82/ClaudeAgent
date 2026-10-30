import { describe, expect, it } from "vitest";
import { buildCalendar } from "./calendar";
import type { Position } from "./portfolio";
import type { TickerMarket } from "@/lib/types";

const pos = (ticker: string): Position => ({
  ticker,
  name: ticker,
  sector: "Tech",
  lots: [],
  qty: 10,
  value: 1000,
  cost: null,
  ret: null,
  w: 0.5,
  dayUsd: 0,
  day: 0,
});

const mk = (ticker: string, over: Partial<TickerMarket> = {}): TickerMarket => ({
  ticker,
  name: ticker,
  price: 100,
  prevClose: 100,
  sp: null,
  zacks: null,
  calls: [],
  closes: [],
  errors: {},
  ...over,
});

const TODAY = "2026-10-07";

describe("buildCalendar", () => {
  it("drops past events and includes today (days 0)", () => {
    const market = {
      AAA: mk("AAA", { next: { date: "2026-10-06", what: "Q3 results", conf: true } }),
      BBB: mk("BBB", { next: { date: TODAY, what: "Q3 results", conf: true } }),
    };
    const c = buildCalendar([pos("AAA"), pos("BBB")], market, TODAY);
    expect(c.events.map((e) => e.ticker)).toEqual(["BBB"]);
    expect(c.events[0].days).toBe(0);
  });

  it("counts results within 14 days and excludes day 15", () => {
    const market = {
      AAA: mk("AAA", { next: { date: "2026-10-21", what: "Q3 results", conf: true } }),
      BBB: mk("BBB", { next: { date: "2026-10-22", what: "Q3 results", conf: false } }),
    };
    const c = buildCalendar([pos("AAA"), pos("BBB")], market, TODAY);
    expect(c.events).toHaveLength(2);
    expect(c.next14.map((e) => e.ticker)).toEqual(["AAA"]);
    expect(c.next14[0].days).toBe(14);
  });

  it("sorts by date then ticker and tags kinds", () => {
    const market = {
      ZZZ: mk("ZZZ", { next: { date: "2026-10-10", what: "results", conf: true } }),
      AAA: mk("AAA", {
        events: [
          { date: "2026-10-10", what: "Investor day", conf: true },
          { date: "2026-10-08", what: "Split", conf: false },
        ],
      }),
    };
    const c = buildCalendar([pos("ZZZ"), pos("AAA")], market, TODAY);
    expect(c.events.map((e) => [e.date, e.ticker, e.kind])).toEqual([
      ["2026-10-08", "AAA", "event"],
      ["2026-10-10", "AAA", "event"],
      ["2026-10-10", "ZZZ", "results"],
    ]);
    expect(c.next14.map((e) => e.ticker)).toEqual(["ZZZ"]);
  });

  it("only includes held tickers", () => {
    const market = {
      AAA: mk("AAA", { next: { date: "2026-10-10", what: "results", conf: true } }),
      OUT: mk("OUT", { next: { date: "2026-10-10", what: "results", conf: true } }),
    };
    const c = buildCalendar([pos("AAA")], market, TODAY);
    expect(c.events.map((e) => e.ticker)).toEqual(["AAA"]);
  });
});
