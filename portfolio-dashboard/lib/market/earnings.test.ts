import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeEarningsMoves, parseNasdaqEarningsDate, parseNasdaqEarningsSurprise } from "./earnings";
import { parseYahooChart } from "./yahoo";

const fx = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8"));

const date = fx("nasdaq-earnings-date-nvda.json");
const noDate = fx("nasdaq-earnings-date-mram-nodate.json");
const surprise = fx("nasdaq-earnings-surprise-nvda.json");
const yahoo = parseYahooChart(fx("yahoo-chart-nvda.json"))!;

const dateJson = (reportText: string, announcement = "") => ({ data: { reportText, announcement } });

describe("parseNasdaqEarningsDate", () => {
  it("parses NVDA: 2026-11-17, quarter label from the fiscal quarter, not confirmed", () => {
    expect(parseNasdaqEarningsDate(date, "2026-11-04")).toEqual({
      date: "2026-11-17",
      what: "Oct 2026 quarter results",
      conf: false,
    });
  });

  it("accepts the report date being today, rejects past dates", () => {
    expect(parseNasdaqEarningsDate(date, "2026-11-17")?.date).toBe("2026-11-17");
    expect(parseNasdaqEarningsDate(date, "2026-11-18")).toBeNull();
  });

  it("returns null when the vendor has no date (MRAM fixture)", () => {
    expect(parseNasdaqEarningsDate(noDate, "2026-11-04")).toBeNull();
  });

  it("falls back to the announcement field when reportText has no date", () => {
    const j = dateJson("Something new.", "Earnings announcement* for NVDA: Nov 17, 2026");
    expect(parseNasdaqEarningsDate(j, "2026-11-04")).toEqual({ date: "2026-11-17", what: "Results", conf: false });
  });

  it("marks conf only if the text says confirmed", () => {
    const j = dateJson("NVDA has confirmed it will report earnings on 12/03/2026 after market close.");
    expect(parseNasdaqEarningsDate(j, "2026-11-04")?.conf).toBe(true);
  });

  it("handles year-boundary dates", () => {
    const j = dateJson("X is expected* to report earnings on  1/5/2027 before market open. The report will be for the fiscal Quarter ending Dec 2026.");
    expect(parseNasdaqEarningsDate(j, "2026-12-30")).toEqual({ date: "2027-01-05", what: "Dec 2026 quarter results", conf: false });
  });

  it.each([
    ["undefined", undefined],
    ["empty string", ""],
    ["HTML", "<html>blocked</html>"],
    ["empty object", {}],
    ["data null", { data: null, status: { rCode: 400 } }],
    ["no text", { data: {} }],
    ["garbage date", dateJson("expected* to report earnings on  13/45/2026 after market close.")],
    ["NaN", dateJson("expected* to report earnings on  NaN/NaN/NaN")],
    ["non-string text", { data: { reportText: 5, announcement: null } }],
  ])("returns null for %s", (_n, input) => {
    expect(parseNasdaqEarningsDate(input, "2026-11-04")).toBeNull();
  });

  it("returns null for an invalid today", () => {
    expect(parseNasdaqEarningsDate(date, "soon")).toBeNull();
  });
});

describe("parseNasdaqEarningsSurprise", () => {
  it("parses the 4 NVDA reports, most recent first", () => {
    expect(parseNasdaqEarningsSurprise(surprise)).toEqual([
      { date: "2026-08-26", surprisePct: 6.22 },
      { date: "2026-05-20", surprisePct: 10 },
      { date: "2026-02-25", surprisePct: 8.28 },
      { date: "2025-11-19", surprisePct: 5.08 },
    ]);
  });

  const rowsJson = (rows: unknown[]) => ({ data: { earningsSurpriseTable: { rows } } });

  it("sorts newest first across a year boundary and caps at 4", () => {
    const rows = ["1/2/2026", "12/30/2025", "3/1/2026", "6/1/2026", "9/1/2026", "9/1/2025"].map((d) => ({
      dateReported: d,
      percentageSurprise: "1",
    }));
    expect(parseNasdaqEarningsSurprise(rowsJson(rows)).map((r) => r.date)).toEqual(["2026-09-01", "2026-06-01", "2026-03-01", "2026-01-02"]);
  });

  it("gives null surprise for n/a or NaN and skips rows with unparseable dates", () => {
    const rows = [
      { dateReported: "8/26/2026", percentageSurprise: "n/a" },
      { dateReported: "5/20/2026", percentageSurprise: "NaN" },
      { dateReported: "bad", percentageSurprise: "5" },
      { dateReported: "2/25/2026", percentageSurprise: "-3.5" },
      { dateReported: "2/25/2026" },
    ];
    expect(parseNasdaqEarningsSurprise(rowsJson(rows))).toEqual([
      { date: "2026-08-26", surprisePct: null },
      { date: "2026-05-20", surprisePct: null },
      { date: "2026-02-25", surprisePct: -3.5 },
      { date: "2026-02-25", surprisePct: null },
    ]);
  });

  it.each([
    ["undefined", undefined],
    ["empty string", ""],
    ["HTML", "<html></html>"],
    ["empty object", {}],
    ["data null", { data: null }],
    ["no table", { data: { symbol: "x" } }],
    ["rows not an array", rowsJson([]).data && { data: { earningsSurpriseTable: { rows: "x" } } }],
    ["table null", { data: { earningsSurpriseTable: null } }],
    ["rows of junk", rowsJson([null, 5, "x", []])],
  ])("returns [] for %s", (_n, input) => {
    expect(parseNasdaqEarningsSurprise(input)).toEqual([]);
  });
});

describe("computeEarningsMoves", () => {
  // Hand-computed. Closes: Mon 100, Tue 110, Wed 99, Thu 108.9, (gap: Fri missing), Mon 120.
  const closes: [string, number][] = [
    ["2026-03-02", 100],
    ["2026-03-03", 110],
    ["2026-03-04", 99],
    ["2026-03-05", 108.9],
    ["2026-03-09", 120],
  ];

  it("move = close of first trading day AFTER the report / close of the trading day BEFORE it, minus 1 (percent)", () => {
    // report Tue 03-03: before = 03-02 (100), after = 03-04 (99) -> -1.00%
    // report Wed 03-04: before = 03-03 (110), after = 03-05 (108.9) -> -1.00%
    // report Thu 03-05: before = 03-04 (99), after = 03-09 (120) (skips the weekend) -> +21.21%
    const out = computeEarningsMoves(
      [
        { date: "2026-03-05", surprisePct: 5 },
        { date: "2026-03-04", surprisePct: null },
        { date: "2026-03-03", surprisePct: -2 },
      ],
      closes,
    );
    expect(out).toEqual([
      ["2026-03-05", 5, 21.21],
      ["2026-03-04", null, -1],
      ["2026-03-03", -2, -1],
    ]);
  });

  it("a report on a non-trading day (Sunday) uses the surrounding trading days", () => {
    // Sun 03-08: before = Thu 03-05 (108.9), after = Mon 03-09 (120) -> +10.19%
    expect(computeEarningsMoves([{ date: "2026-03-08", surprisePct: 1 }], closes)).toEqual([["2026-03-08", 1, 10.19]]);
  });

  it("returns null move when there is no close before or after the report", () => {
    const out = computeEarningsMoves(
      [
        { date: "2026-03-02", surprisePct: 1 }, // nothing before the first close
        { date: "2026-03-09", surprisePct: 2 }, // nothing after the last close
        { date: "2025-01-01", surprisePct: 3 }, // before the series
      ],
      closes,
    );
    expect(out).toEqual([
      ["2026-03-02", 1, null],
      ["2026-03-09", 2, null],
      ["2025-01-01", 3, null],
    ]);
  });

  it("handles year boundary", () => {
    const c: [string, number][] = [
      ["2025-12-31", 50],
      ["2026-01-02", 55],
    ];
    expect(computeEarningsMoves([{ date: "2026-01-01", surprisePct: 0 }], c)).toEqual([["2026-01-01", 0, 10]]);
  });

  it("returns null moves for empty closes, bad closes or bad dates; never throws", () => {
    expect(computeEarningsMoves([{ date: "2026-03-03", surprisePct: 1 }], [])).toEqual([["2026-03-03", 1, null]]);
    expect(computeEarningsMoves([{ date: "nope", surprisePct: 1 }], closes)).toEqual([["nope", 1, null]]);
    const zero: [string, number][] = [
      ["2026-03-02", 0],
      ["2026-03-04", 5],
    ];
    expect(computeEarningsMoves([{ date: "2026-03-03", surprisePct: 1 }], zero)).toEqual([["2026-03-03", 1, null]]);
    expect(computeEarningsMoves([], closes)).toEqual([]);
  });

  it("does not depend on closes being sorted", () => {
    const shuffled = [closes[3], closes[0], closes[4], closes[2], closes[1]];
    expect(computeEarningsMoves([{ date: "2026-03-03", surprisePct: 1 }], shuffled)).toEqual([["2026-03-03", 1, -1]]);
  });

  it("works end to end on the NVDA fixtures (Aug 26 2026 after close: 213.05 -> 227.98 = +7.01%)", () => {
    const out = computeEarningsMoves(parseNasdaqEarningsSurprise(surprise), yahoo.closes);
    expect(out[0]).toEqual(["2026-08-26", 6.22, 7.01]);
    expect(out).toHaveLength(4);
  });
});
