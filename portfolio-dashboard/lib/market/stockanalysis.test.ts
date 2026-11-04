import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseStockAnalysisCalls, parseStockAnalysisForecast } from "./stockanalysis";

const fx = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8");

const nvdaForecast = fx("stockanalysis-forecast-nvda.md");
const nvdaRatings = fx("stockanalysis-ratings-nvda.md");
const mramForecast = fx("stockanalysis-forecast-mram.md");

const HTML_ERROR = "<html><head><title>403 Forbidden</title></head><body><h1>Access denied</h1></body></html>";

describe("parseStockAnalysisForecast", () => {
  it("parses NVDA: avg 327.14, low 180, high 515, median 315, n 62", () => {
    const r = parseStockAnalysisForecast(nvdaForecast);
    expect(r?.sp).toEqual({ avg: 327.14, low: 180, high: 515, median: 315, n: 62 });
  });

  it("parses recommendation trends from the latest column", () => {
    const r = parseStockAnalysisForecast(nvdaForecast);
    expect(r?.ratings).toEqual({ strongBuy: 49, buy: 10, hold: 2, sell: 0, strongSell: 1 });
  });

  it("parses a thinly covered stock (MRAM): n 4 and avg without trailing zero", () => {
    const r = parseStockAnalysisForecast(mramForecast);
    expect(r?.sp).toEqual({ avg: 25.5, low: 19, high: 38, median: 22.5, n: 4 });
    expect(r!.sp.n!).toBeLessThan(8);
  });

  it.each([
    ["empty string", ""],
    ["HTML error page", HTML_ERROR],
    ["truncated before the table", nvdaForecast.slice(0, nvdaForecast.indexOf("## Price Target"))],
    ["truncated mid-table", nvdaForecast.slice(0, nvdaForecast.indexOf("| Price |") + 12)],
  ])("returns null for %s", (_n, input) => {
    expect(parseStockAnalysisForecast(input)).toBeNull();
  });

  it("returns null when the headline sentence is missing", () => {
    expect(parseStockAnalysisForecast(nvdaForecast.replace("According to 62 analysts polled by S&P Global", "Analysts say"))).toBeNull();
  });

  it("returns null when a table number is n/a or NaN", () => {
    expect(parseStockAnalysisForecast(nvdaForecast.replace("| Price | $180 |", "| Price | n/a |"))).toBeNull();
    expect(parseStockAnalysisForecast(nvdaForecast.replace("$315", "NaN"))).toBeNull();
  });

  it("returns null when the column headers change", () => {
    expect(parseStockAnalysisForecast(nvdaForecast.replace("| Target | Low | Average | Median | High |", "| Target | Min | Mean | Mid | Max |"))).toBeNull();
  });

  it("returns null for inconsistent numbers (low above high)", () => {
    expect(parseStockAnalysisForecast(nvdaForecast.replace("| $315 | $515 |", "| $315 | $100 |"))).toBeNull();
  });

  it("omits ratings (but keeps sp) when the trends table is unreadable", () => {
    const broken = nvdaForecast.replace("| Strong Buy | 48 | 48 | 48 | 49 | 49 | 49 |", "| Strong Buy | x | x | x | x | x | n/a |");
    const r = parseStockAnalysisForecast(broken);
    expect(r?.sp.avg).toBe(327.14);
    expect(r?.ratings).toBeUndefined();
  });
});

describe("parseStockAnalysisCalls", () => {
  const ASOF = "2026-11-04";

  it("parses the NVDA ratings page: skips n/a targets, newest first", () => {
    const calls = parseStockAnalysisCalls(nvdaRatings, ASOF);
    expect(calls).toEqual([
      ["Barclays", 275, "2026-10-26"],
      ["Bernstein", 400, "2026-10-26"],
      ["Morgan Stanley", 300, "2026-10-22"],
      ["Citi", 315, "2026-10-22"],
      ["Goldman Sachs", 300, "2026-10-21"],
      ["Needham", 300, "2026-10-21"],
    ]);
  });

  it("parses the 5-row table on the forecast page too", () => {
    const calls = parseStockAnalysisCalls(nvdaForecast, ASOF);
    expect(calls).toHaveLength(4);
    expect(calls[0]).toEqual(["Barclays", 275, "2026-10-26"]);
  });

  it("drops calls older than 90 days relative to asof (MRAM Jul 10 is too old)", () => {
    const calls = parseStockAnalysisCalls(mramForecast, ASOF);
    expect(calls).toEqual([
      ["Needham", 19, "2026-10-29"],
      ["Maxim Group", 25, "2026-10-12"],
    ]);
  });

  it("drops calls dated after asof", () => {
    expect(parseStockAnalysisCalls(nvdaRatings, "2026-10-21").map((c) => c[2])).toEqual(["2026-10-21", "2026-10-21"]);
  });

  const header = "| Analyst | Firm | Rating | Rating | Action | Price Target | Upside | Date |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n";
  const row = (firm: string, pt: string, date: string) =>
    `| [A](https://x/)<br>${firm} | ${firm} | Buy<br>Raises<br>${pt} | Buy | Raises | ${pt} | +1% | ${date} |\n`;

  it("uses the NEW target of 'a → b'", () => {
    const md = header + row("Wedbush", "$285 → $345", "Oct 7, 2026");
    expect(parseStockAnalysisCalls(md, ASOF)).toEqual([["Wedbush", 345, "2026-10-07"]]);
  });

  it("handles thousands separators and ascii arrows", () => {
    const md = header + row("Foo", "$1,200 -> $1,350.50", "Oct 7, 2026");
    expect(parseStockAnalysisCalls(md, ASOF)).toEqual([["Foo", 1350.5, "2026-10-07"]]);
  });

  it("skips rows with missing targets, '-' and unparseable dates without throwing", () => {
    const md =
      header +
      row("NoTarget", "n/a", "Oct 7, 2026") +
      row("Dash", "-", "Oct 7, 2026") +
      row("BadDate", "$10", "Octember 7") +
      row("NaNTarget", "$NaN", "Oct 7, 2026") +
      row("Good", "$10", "Oct 8, 2026") +
      "| broken row\n| too | few |\n";
    expect(parseStockAnalysisCalls(md, ASOF)).toEqual([["Good", 10, "2026-10-08"]]);
  });

  it("handles the year boundary (asof early January, calls in December)", () => {
    const md = header + row("Dec", "$50", "Dec 30, 2025") + row("Jan", "$60", "Jan 2, 2026") + row("Old", "$40", "Sep 1, 2025");
    expect(parseStockAnalysisCalls(md, "2026-01-05")).toEqual([
      ["Jan", 60, "2026-01-02"],
      ["Dec", 50, "2025-12-30"],
    ]);
  });

  it("is stable for equal dates and sorts descending", () => {
    const md = header + row("Old", "$1", "Oct 1, 2026") + row("A", "$2", "Oct 5, 2026") + row("B", "$3", "Oct 5, 2026");
    expect(parseStockAnalysisCalls(md, ASOF).map((c) => c[0])).toEqual(["A", "B", "Old"]);
  });

  it.each([
    ["empty string", ""],
    ["HTML error page", HTML_ERROR],
    ["no table header", "# NVIDIA\n\nNo tables here"],
  ])("returns [] for %s", (_n, input) => {
    expect(parseStockAnalysisCalls(input, ASOF)).toEqual([]);
  });

  it("returns [] when the column headers are renamed", () => {
    expect(parseStockAnalysisCalls(nvdaRatings.replace("| Price Target |", "| Target |"), ASOF)).toEqual([]);
  });

  it("returns what it can for truncated input and never throws", () => {
    const cut = nvdaRatings.slice(0, nvdaRatings.indexOf("Daniel Zhu") + 30);
    expect(() => parseStockAnalysisCalls(cut, ASOF)).not.toThrow();
    expect(parseStockAnalysisCalls(cut, ASOF)).toEqual([["Barclays", 275, "2026-10-26"]]);
  });

  it("returns [] for an invalid asof", () => {
    expect(parseStockAnalysisCalls(nvdaRatings, "not-a-date")).toEqual([]);
  });
});
