import type { Lot } from "./portfolio";

type Series = [date: string, close: number][];

export type PerfPoint = {
  d: string;
  v: number;
  c: number;
  g: number;
  bSPY?: number;
  bQQQ?: number;
};

export type Performance = {
  series: PerfPoint[];
  datedLots: number;
  undatedLots: number;
  skipped: string[];
};

const MIN_ALIGNED = 120;

const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** Raw beta: cov(stock, spy) / var(spy) of daily simple returns on shared dates. */
export function computeBeta(stock: [string, number][], spy: [string, number][]): number | null {
  const spyMap = new Map<string, number>();
  for (const [d, c] of spy) if (valid(c)) spyMap.set(d, c);
  const aligned: [string, number, number][] = [];
  const seen = new Set<string>();
  for (const [d, c] of stock) {
    const s = spyMap.get(d);
    if (valid(c) && s !== undefined && !seen.has(d)) {
      seen.add(d);
      aligned.push([d, c, s]);
    }
  }
  if (aligned.length < MIN_ALIGNED) return null;
  aligned.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const rs: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < aligned.length; i++) {
    rs.push(aligned[i][1] / aligned[i - 1][1] - 1);
    rb.push(aligned[i][2] / aligned[i - 1][2] - 1);
  }
  const n = rs.length;
  const ms = rs.reduce((a, b) => a + b, 0) / n;
  const mb = rb.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    cov += (rs[i] - ms) * (rb[i] - mb);
    varB += (rb[i] - mb) ** 2;
  }
  if (!(varB > 1e-18)) return null;
  const beta = cov / varB;
  return Number.isFinite(beta) ? beta : null;
}

/** Walks ascending dates asking for the last close at or before each. */
function carrier(series: Series | undefined) {
  const pts = (series ?? [])
    .filter(([, c]) => valid(c))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let i = -1;
  return (d: string): number | null => {
    while (i + 1 < pts.length && pts[i + 1][0] <= d) i++;
    return i >= 0 ? pts[i][1] : null;
  };
}

export function buildPerformance(
  lots: Lot[],
  closes: Record<string, [string, number][]>,
  bench: { SPY: [string, number][]; QQQ: [string, number][] },
  asof: string,
): Performance | null {
  const skipped: string[] = [];
  const part: Lot[] = [];
  for (const l of lots) {
    if (typeof l.cost !== "number" || !Number.isFinite(l.cost) || l.cost <= 0) continue;
    const cs = closes[l.ticker];
    if (!cs || !cs.some(([, c]) => valid(c))) {
      if (!skipped.includes(l.ticker)) skipped.push(l.ticker);
      continue;
    }
    part.push(l);
  }
  if (part.length === 0) return null;
  const dated = part.filter((l) => l.openDate);
  if (dated.length === 0) return null;

  const tickers = [...new Set(part.map((l) => l.ticker))];
  const dateSet = new Set<string>();
  for (const t of tickers) for (const [d, c] of closes[t]) if (valid(c) && d <= asof) dateSet.add(d);
  const allDates = [...dateSet].sort();
  const earliest = dated.reduce((m, l) => (l.openDate! < m ? l.openDate! : m), dated[0].openDate!);
  const dates = allDates.filter((d) => d >= earliest);
  if (dates.length === 0) return null;

  const priceAt = new Map(tickers.map((t) => [t, carrier(closes[t])]));
  const entry = part.map((l) => {
    if (!l.openDate) return 0;
    const idx = dates.findIndex((d) => d >= l.openDate!);
    return idx; // -1 = never enters
  });

  const series: PerfPoint[] = [];
  dates.forEach((d, di) => {
    let v = 0;
    let c = 0;
    part.forEach((l, li) => {
      if (entry[li] < 0 || entry[li] > di) return;
      const p = priceAt.get(l.ticker)!(d);
      if (p !== null) v += l.shares * p;
      c += l.cost as number;
    });
    series.push({ d, v, c, g: v - c });
  });

  for (const key of ["SPY", "QQQ"] as const) {
    const price = carrier(bench[key]);
    if (price(dates[0]) === null) continue;
    const at = carrier(bench[key]);
    let units = 0;
    let prevC = 0;
    for (const p of series) {
      const b = at(p.d) as number;
      const inflow = p.c - prevC;
      if (inflow !== 0) units += inflow / b;
      prevC = p.c;
      const val = units * b;
      if (Number.isFinite(val)) p[key === "SPY" ? "bSPY" : "bQQQ"] = val;
    }
  }

  return { series, datedLots: dated.length, undatedLots: part.length - dated.length, skipped };
}
