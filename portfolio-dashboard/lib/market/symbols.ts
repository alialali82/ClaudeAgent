// Canonical tickers are Yahoo-style (BRK-B). Verified 2026-11-04:
//  - Yahoo: BRK-B.
//  - StockAnalysis path: lowercase with a dot (stockanalysis.com/stocks/brk.b/forecast/ loads).
//  - Nasdaq analyst/company API: BRK.B (BRK-B answers "Symbol not exists"; BRK.B is recognised).
// Single point of change for all per-source symbol quirks.
export type Source = "yahoo" | "stockanalysis" | "nasdaq";

export function toSourceSymbol(ticker: string, source: Source): string {
  const canon = ticker.trim().toUpperCase().replace(/\./g, "-");
  if (source === "yahoo") return canon;
  const dotted = canon.replace(/-/g, ".");
  return source === "nasdaq" ? dotted : dotted.toLowerCase();
}
