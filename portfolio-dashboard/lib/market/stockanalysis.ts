// Pure parsers for StockAnalysis.com pages scraped to markdown (via Firecrawl, see 11b).
// Layout recorded 2026-11-04, see __fixtures__/ and docs/superpowers/notes/data-sources.md.
// The site is not an API: on ANY layout surprise return null / [] rather than wrong numbers.
import type { Call, TargetSet } from "../types";
import { daysBetween, isIsoDate, parseMoney, toIso } from "./util";

/** Calls older than this many days (relative to `asof`) are dropped. */
export const CALL_WINDOW_DAYS = 90;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function cells(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  const parts = t.split("|").map((c) => c.trim());
  parts.shift();
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function isSeparator(cs: string[]): boolean {
  return cs.length > 0 && cs.every((c) => /^:?-{2,}:?$/.test(c));
}

/** All table rows (as cell arrays) following the first header line matching `isHeader`. */
function tableAfter(lines: string[], isHeader: (h: string[]) => boolean): { header: string[]; rows: string[][] } | null {
  for (let i = 0; i < lines.length; i++) {
    const h = cells(lines[i]);
    if (!h || !isHeader(h.map((c) => c.toLowerCase()))) continue;
    const rows: string[][] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const r = cells(lines[j]);
      if (!r) break;
      if (isSeparator(r)) continue;
      rows.push(r);
    }
    return { header: h.map((c) => c.toLowerCase()), rows };
  }
  return null;
}

export function parseStockAnalysisForecast(
  markdown: string,
): { sp: TargetSet; ratings?: Record<string, number> } | null {
  try {
    if (typeof markdown !== "string" || !markdown) return null;
    const head = /According to\s+(\d[\d,]*)\s+analysts?\s+polled by S&P Global/i.exec(markdown);
    if (!head) return null;
    const n = Number(head[1].replace(/,/g, ""));
    if (!Number.isInteger(n) || n <= 0) return null;

    const lines = markdown.split(/\r?\n/);
    const t = tableAfter(
      lines,
      (h) => h.length === 5 && h[0] === "target" && h[1] === "low" && h[2] === "average" && h[3] === "median" && h[4] === "high",
    );
    const price = t?.rows.find((r) => r[0]?.toLowerCase() === "price");
    if (!t || !price || price.length !== 5) return null;
    const [low, avg, median, high] = price.slice(1).map(parseMoney);
    if (low === null || avg === null || median === null || high === null) return null;
    if (!(low <= avg && avg <= high && low <= median && median <= high)) return null;
    const sp: TargetSet = { avg, low, high, median, n };

    const out: { sp: TargetSet; ratings?: Record<string, number> } = { sp };
    const trends = tableAfter(lines, (h) => h[0] === "rating" && h.length >= 3 && /^[a-z]{3} '\d{2}$/.test(h[1]));
    if (trends) {
      const keys: Record<string, string> = {
        "strong buy": "strongBuy", buy: "buy", hold: "hold", sell: "sell", "strong sell": "strongSell",
      };
      const ratings: Record<string, number> = {};
      for (const r of trends.rows) {
        const key = keys[r[0]?.toLowerCase()];
        if (!key) continue;
        const v = Number(r[r.length - 1]);
        if (/^\d+$/.test(r[r.length - 1] ?? "") && Number.isFinite(v)) ratings[key] = v;
      }
      if (Object.keys(ratings).length === 5) out.ratings = ratings;
    }
    return out;
  } catch {
    return null;
  }
}

function parseDate(s: string): string | null {
  const m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  return mon ? toIso(Number(m[3]), mon, Number(m[2])) : null;
}

/** "$300" -> 300; "$285 → $345" / "$285 -> $345" -> 345 (the NEW target); "n/a", "-" -> null. */
function parseTarget(s: string): number | null {
  const parts = s.split(/→|->|=>/).map((p) => p.trim());
  return parseMoney(parts[parts.length - 1]);
}

/**
 * Named analyst calls from a "Latest Forecasts" / "Ratings History" table (both pages share the
 * layout; the ratings page lists 8 rows, the forecast page 5). Dated within CALL_WINDOW_DAYS of
 * `asof` (and not after it), newest first, stable for ties. Unparseable rows are skipped.
 */
export function parseStockAnalysisCalls(markdown: string, asof: string): Call[] {
  try {
    if (typeof markdown !== "string" || !markdown || !isIsoDate(asof)) return [];
    const t = tableAfter(
      markdown.split(/\r?\n/),
      (h) => h.includes("analyst") && h.includes("firm") && h.includes("price target") && h.includes("date"),
    );
    if (!t) return [];
    const iFirm = t.header.indexOf("firm");
    const iPt = t.header.indexOf("price target");
    const iDate = t.header.indexOf("date");
    const calls: Call[] = [];
    for (const r of t.rows) {
      if (r.length !== t.header.length) continue;
      const firm = r[iFirm]?.replace(/[​-‏⁠﻿]/g, "").trim();
      const target = parseTarget(r[iPt] ?? "");
      const date = parseDate(r[iDate] ?? "");
      if (!firm || target === null || target <= 0 || !date) continue;
      const age = daysBetween(date, asof);
      if (age < 0 || age > CALL_WINDOW_DAYS) continue;
      calls.push([firm, target, date]);
    }
    return calls
      .map((c, i) => ({ c, i }))
      .sort((a, b) => (a.c[2] < b.c[2] ? 1 : a.c[2] > b.c[2] ? -1 : a.i - b.i))
      .map((x) => x.c);
  } catch {
    return [];
  }
}
