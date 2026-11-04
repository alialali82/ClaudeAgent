import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseYahooChart } from "./yahoo";

const nvda = JSON.parse(
  readFileSync(fileURLToPath(new URL("./__fixtures__/yahoo-chart-nvda.json", import.meta.url)), "utf8"),
);

function chart(opts: {
  ts: number[];
  close: (number | null)[];
  gmtoffset?: number | null;
  meta?: Record<string, unknown>;
}) {
  return {
    chart: {
      result: [
        {
          meta: { symbol: "TST", regularMarketPrice: 11, gmtoffset: opts.gmtoffset === undefined ? 0 : opts.gmtoffset, ...opts.meta },
          timestamp: opts.ts,
          indicators: { quote: [{ close: opts.close }] },
        },
      ],
      error: null,
    },
  };
}
const DAY = 86400;
const T0 = Date.UTC(2026, 0, 5, 14, 30) / 1000; // Mon 2026-01-05 14:30 UTC

describe("parseYahooChart (NVDA fixture)", () => {
  const r = parseYahooChart(nvda);
  it("parses name, price, prevClose and 252 closes", () => {
    expect(r?.name).toBe("NVIDIA Corporation");
    expect(r?.price).toBe(202.35);
    expect(r?.prevClose).toBeCloseTo(206.69, 2);
    expect(r?.closes).toHaveLength(252);
  });
  it("closes are ISO-dated ascending; first and last are as recorded", () => {
    expect(r?.closes[0][0]).toBe("2025-11-04");
    expect(r?.closes[0][1]).toBeCloseTo(198.69, 2);
    expect(r?.closes.at(-1)?.[0]).toBe("2026-11-04");
    expect(r?.closes.at(-2)?.[0]).toBe("2026-11-03");
    const dates = r!.closes.map((c) => c[0]);
    expect([...dates].sort()).toEqual(dates);
  });
  it("prevClose is the close before the last close, not chartPreviousClose", () => {
    expect(nvda.chart.result[0].meta.chartPreviousClose).toBeCloseTo(198.69, 2);
    expect(r?.prevClose).not.toBeCloseTo(198.69, 2);
  });
});

describe("parseYahooChart (synthetic)", () => {
  it("skips null closes in the middle", () => {
    const r = parseYahooChart(chart({ ts: [T0, T0 + DAY, T0 + 2 * DAY, T0 + 3 * DAY], close: [10, null, 12, 13] }));
    expect(r?.closes).toEqual([
      ["2026-01-05", 10],
      ["2026-01-07", 12],
      ["2026-01-08", 13],
    ]);
    expect(r?.prevClose).toBe(12);
  });

  it("converts to exchange-local date with gmtoffset (just after local midnight)", () => {
    // 2026-01-05T16:00:00Z is 2026-01-06 01:00 in Tokyo (+9h): local calendar date is the 6th.
    const ts = Date.UTC(2026, 0, 5, 16, 0) / 1000;
    const r = parseYahooChart(chart({ ts: [ts - DAY, ts], close: [1, 2], gmtoffset: 32400 }));
    expect(r?.closes.map((c) => c[0])).toEqual(["2026-01-05", "2026-01-06"]);
    // and a negative offset moves it back: 02:00Z at -5h is 21:00 the previous day
    const ts2 = Date.UTC(2026, 0, 6, 2, 0) / 1000;
    const r2 = parseYahooChart(chart({ ts: [ts2 - DAY, ts2], close: [1, 2], gmtoffset: -18000 }));
    expect(r2?.closes.map((c) => c[0])).toEqual(["2026-01-04", "2026-01-05"]);
  });

  it("falls back from longName to shortName to symbol", () => {
    const base = { ts: [T0, T0 + DAY], close: [1, 2] };
    expect(parseYahooChart(chart({ ...base, meta: { longName: "Long", shortName: "Short" } }))?.name).toBe("Long");
    expect(parseYahooChart(chart({ ...base, meta: { shortName: "Short" } }))?.name).toBe("Short");
    expect(parseYahooChart(chart(base))?.name).toBe("TST");
  });

  it("collapses duplicate dates (keeps the later bar)", () => {
    const r = parseYahooChart(chart({ ts: [T0, T0 + 60, T0 + DAY], close: [1, 2, 3] }));
    expect(r?.closes).toEqual([
      ["2026-01-05", 2],
      ["2026-01-06", 3],
    ]);
  });

  it("returns null with fewer than 2 usable closes", () => {
    expect(parseYahooChart(chart({ ts: [T0], close: [1] }))).toBeNull();
    expect(parseYahooChart(chart({ ts: [T0, T0 + DAY], close: [1, null] }))).toBeNull();
    expect(parseYahooChart(chart({ ts: [], close: [] }))).toBeNull();
  });

  it("returns null when price or gmtoffset is missing/invalid", () => {
    const base = { ts: [T0, T0 + DAY], close: [1, 2] };
    expect(parseYahooChart(chart({ ...base, meta: { regularMarketPrice: NaN } }))).toBeNull();
    expect(parseYahooChart(chart({ ...base, meta: { regularMarketPrice: "n/a" } }))).toBeNull();
    expect(parseYahooChart(chart({ ...base, gmtoffset: null }))).toBeNull();
  });

  it("returns null when timestamp and close lengths differ", () => {
    expect(parseYahooChart(chart({ ts: [T0, T0 + DAY, T0 + 2 * DAY], close: [1, 2] }))).toBeNull();
  });

  it.each([
    ["undefined", undefined],
    ["empty string", ""],
    ["HTML", "<html>Too Many Requests</html>"],
    ["empty object", {}],
    ["error response", { chart: { result: null, error: { code: "Not Found", description: "No data found" } } }],
    ["empty result", { chart: { result: [], error: null } }],
    ["no indicators", { chart: { result: [{ meta: { gmtoffset: 0, regularMarketPrice: 1 }, timestamp: [1, 2] }] } }],
    ["NaN closes", chart({ ts: [T0, T0 + DAY], close: [NaN, NaN] })],
  ])("returns null for %s", (_n, input) => {
    expect(parseYahooChart(input)).toBeNull();
  });

  it("returns null for truncated fixture-derived data", () => {
    const cut = JSON.parse(JSON.stringify(nvda));
    delete cut.chart.result[0].indicators;
    expect(parseYahooChart(cut)).toBeNull();
  });
});
