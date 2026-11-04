import { buildDashboard, type Benchmarks, type Dashboard } from "@/lib/dashboard/build";
import type { Holding, TickerMarket } from "@/lib/types";
import { loadReferenceMarket } from "./fromReference";

/** Fixed "today" so the sample never depends on the clock. */
const TODAY = "2026-10-08";
const N_DAYS = 130;

/** Last `n` business days up to and including `end` (ISO), ascending. */
function businessDays(end: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${end}T00:00:00Z`);
  while (out.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out.reverse();
}

const hash = (s: string): number => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);

/** Deterministic trend + sine series that ends exactly at `last` (and `prev` the day before). */
function synth(key: string, dates: string[], last: number, prev: number, drift: number): [string, number][] {
  const phase = hash(key) / 100;
  const n = dates.length;
  const raw = dates.map((_, i) => 1 - drift * ((n - 1 - i) / (n - 1)) + 0.035 * Math.sin(i / 7 + phase));
  const k = last / raw[n - 1];
  const out = raw.map((r, i) => [dates[i], Math.round(r * k * 100) / 100] as [string, number]);
  out[n - 1][1] = last;
  out[n - 2][1] = prev;
  return out;
}

function benchSeries(key: string, dates: string[], start: number, drift: number): [string, number][] {
  const phase = hash(key) / 100;
  return dates.map((d, i) => [
    d,
    Math.round(start * (1 + drift * (i / (dates.length - 1)) + 0.02 * Math.sin(i / 9 + phase)) * 100) / 100,
  ]);
}

const TICKERS = ["NVDA", "MU", "NOW", "GOOGL", "MRAM", "BSX", "VRA", "AEM", "AMZN"];

/** Synthetic holdings: made-up quantities and costs, two accounts, one lot with no cost. */
const HOLDINGS: Holding[] = [
  { ticker: "NVDA", shares: 70, cost: 150, costKind: "perShare", account: "Brokerage", openDate: "2026-05-04" },
  { ticker: "NVDA", shares: 20, cost: 3600, costKind: "total", account: "Retirement", openDate: "2026-06-15" },
  { ticker: "MU", shares: 12, cost: 7000, costKind: "total", account: "Brokerage", openDate: "2026-05-18" },
  { ticker: "NOW", shares: 90, cost: 160, costKind: "perShare", account: "Brokerage", openDate: "2026-07-01" },
  { ticker: "GOOGL", shares: 35, cost: 280, costKind: "perShare", account: "Retirement" },
  { ticker: "GOOGL", shares: 15, account: "Retirement" },
  { ticker: "MRAM", shares: 400, cost: 21, costKind: "perShare", account: "Brokerage", openDate: "2026-06-02" },
  { ticker: "BSX", shares: 160, cost: 52, costKind: "perShare", account: "Retirement", openDate: "2026-05-11" },
  { ticker: "VRA", shares: 900, cost: 5.4, costKind: "perShare", account: "Brokerage" },
  { ticker: "AEM", shares: 25, cost: 3100, costKind: "total", account: "Retirement", openDate: "2026-08-03" },
  { ticker: "AMZN", shares: 30, cost: 210, costKind: "perShare", account: "Brokerage", openDate: "2026-05-04" },
];

function sampleMarket(): { market: Record<string, TickerMarket>; bench: Benchmarks } {
  const ref = loadReferenceMarket();
  const dates = businessDays(ref.asof, N_DAYS);
  const market: Record<string, TickerMarket> = {};
  TICKERS.forEach((t, i) => {
    const m = ref.market[t];
    market[t] = { ...m, closes: synth(t, dates, m.price, m.prevClose, 0.08 + (i % 4) * 0.05) };
  });
  return {
    market,
    bench: { SPY: benchSeries("SPY", dates, 480, 0.12), QQQ: benchSeries("QQQ", dates, 410, 0.18) },
  };
}

/** A realistic, fully deterministic dashboard: 9 positions, two accounts, performance present. */
export function sampleDashboard(): Dashboard {
  const { market, bench } = sampleMarket();
  return buildDashboard(HOLDINGS, market, bench, TODAY);
}

/** Nothing could be priced: no positions, one failure. */
export function emptyDashboard(): Dashboard {
  return buildDashboard(
    [{ ticker: "ZZZZ", shares: 10 }],
    {},
    { SPY: [], QQQ: [] },
    TODAY,
    { ZZZZ: "unknown" },
  );
}

/** Some lookups failed, a ticker has no Street target, and some sources were unavailable. */
export function degradedDashboard(): Dashboard {
  const { market, bench } = sampleMarket();
  const noTarget = (t: string, errors: Record<string, string>): void => {
    market[t] = { ...market[t], sp: null, zacks: null, calls: [], errors };
  };
  noTarget("MRAM", { stockanalysis: "timeout", nasdaq_targets: "http 503" });
  noTarget("VRA", { stockanalysis: "no data" });
  market.AEM = { ...market.AEM, errors: { nasdaq_earnings: "timeout", beta: "short history" } };
  const holdings: Holding[] = [
    ...HOLDINGS,
    { ticker: "SLOW", shares: 5 },
    { ticker: "NOPE", shares: 3 },
    { ticker: "NOPR", shares: 8 },
  ];
  return buildDashboard(holdings, market, bench, TODAY, { SLOW: "deadline", NOPE: "unknown", BADQ: "no_price" });
}
