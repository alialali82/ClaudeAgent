// Pure parser for Yahoo Finance v8 chart JSON (`range=1y&interval=1d`).
// Shape recorded 2026-11-04 (see __fixtures__/yahoo-chart-nvda.json): chart.result[0] has
// meta{symbol,longName,shortName,regularMarketPrice,chartPreviousClose,gmtoffset,...},
// timestamp[] (epoch s, bar start) and indicators.quote[0].close[] (may contain nulls).
// While the market is open the last bar is the partial current day.
import { isRecord, toIso } from "./util";

export function parseYahooChart(
  json: unknown,
): { name: string; price: number; prevClose: number; closes: [string, number][] } | null {
  try {
    if (!isRecord(json) || !isRecord(json.chart)) return null;
    const { result, error } = json.chart;
    if (error || !Array.isArray(result) || !isRecord(result[0])) return null;
    const r = result[0];
    const meta = r.meta;
    if (!isRecord(meta)) return null;
    const price = meta.regularMarketPrice;
    const off = meta.gmtoffset;
    if (typeof price !== "number" || !Number.isFinite(price)) return null;
    if (typeof off !== "number" || !Number.isFinite(off)) return null;

    const ts = r.timestamp;
    const quote = isRecord(r.indicators) && Array.isArray(r.indicators.quote) ? r.indicators.quote[0] : null;
    const close = isRecord(quote) ? quote.close : null;
    if (!Array.isArray(ts) || !Array.isArray(close) || ts.length !== close.length) return null;

    const closes: [string, number][] = [];
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      const c = close[i];
      if (typeof t !== "number" || !Number.isFinite(t)) continue;
      if (typeof c !== "number" || !Number.isFinite(c)) continue; // price-only closes; nulls skipped
      // Exchange-local calendar date: shift by the exchange's UTC offset, then read the UTC date.
      const d = new Date((t + off) * 1000);
      const iso = toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      if (!iso) continue;
      const last = closes[closes.length - 1];
      if (last && last[0] === iso) last[1] = c; // duplicate date: keep the later bar
      else if (!last || iso > last[0]) closes.push([iso, c]);
    }
    if (closes.length < 2) return null;

    const name = [meta.longName, meta.shortName, meta.symbol].find(
      (x): x is string => typeof x === "string" && x.trim() !== "",
    );
    if (!name) return null;
    // NOT meta.chartPreviousClose: that is the close before the START of the range.
    return { name, price, prevClose: closes[closes.length - 2][1], closes };
  } catch {
    return null;
  }
}
