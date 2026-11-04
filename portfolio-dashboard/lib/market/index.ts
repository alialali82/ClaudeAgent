// Orchestration: per-ticker market data assembled from independent, independently cached and
// independently failing sources. Never logs tickers, URLs, keys or payloads.
import { computeBeta } from "@/lib/compute/performance";
import { getKv } from "@/lib/kv";
import type { Call, TargetSet, TickerMarket } from "@/lib/types";
import { cached, TTL } from "./cache";
import { parseNasdaqEarningsDate, parseNasdaqEarningsSurprise, computeEarningsMoves } from "./earnings";
import { scrape } from "./firecrawl";
import { fetchJson } from "./http";
import { parseNasdaqProfile, parseNasdaqTargets } from "./nasdaq";
import { parseStockAnalysisCalls, parseStockAnalysisForecast } from "./stockanalysis";
import { toSourceSymbol } from "./symbols";
import { parseYahooChart } from "./yahoo";

export class UnknownTicker extends Error {
  readonly ticker: string;
  constructor(ticker: string) {
    super("unknown_ticker");
    this.name = "UnknownTicker";
    this.ticker = ticker;
  }
}

/** Thrown when no price could be obtained for a known ticker. `errors` holds per-source short codes. */
export class NoPriceError extends Error {
  readonly errors: Record<string, string>;
  constructor(errors: Record<string, string>) {
    super("no_price");
    this.name = "NoPriceError";
    this.errors = errors;
  }
}

const SNAPSHOT_TTL = 4 * 86400;
const TICKER_RE = /^[A-Z0-9][A-Z0-9.-]{0,9}$/;

type Settled<T> = { ok: true; v: T } | { ok: false; e: unknown };
const settle = <T>(p: Promise<T>): Promise<Settled<T>> =>
  p.then(
    (v) => ({ ok: true, v }) as const,
    (e: unknown) => ({ ok: false, e }) as const,
  );

function codeOf(e: unknown): string {
  const c = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  return typeof c === "string" && /^[a-z0-9_]{1,32}$/.test(c) ? c : "failed";
}

function isNotFound(json: unknown): boolean {
  const err = (json as { chart?: { error?: { code?: unknown } | null } } | null)?.chart?.error;
  return !!err && err.code === "Not Found";
}

const yahooUrl = (t: string) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${toSourceSymbol(t, "yahoo")}?range=1y&interval=1d`;

async function yahooRaw(t: string): Promise<unknown> {
  return cached(`mkt:yahoo:${t}`, TTL.prices, async () => {
    let json: unknown;
    try {
      json = await fetchJson(yahooUrl(t));
    } catch (e) {
      if (codeOf(e) === "http_404") throw new UnknownTicker(t);
      throw e;
    }
    if (isNotFound(json)) throw new UnknownTicker(t);
    return json;
  });
}

const saUrl = (t: string, page: "forecast" | "ratings") =>
  `https://stockanalysis.com/stocks/${toSourceSymbol(t, "stockanalysis")}/${page}/`;
class ParseError extends Error {
  readonly code = "parse";
  constructor() {
    super("parse");
  }
}

const RATINGS_HEADER = /\|\s*Analyst\s*\|[^\n]*Price Target/i;

/** Junk / 404 / layout-changed pages throw inside `load`, so they are never written to the cache. */
const saRaw = (t: string, page: "forecast" | "ratings") =>
  cached(`mkt:sa:${page}:${t}`, TTL.targets, async () => {
    const md = await scrape(saUrl(t, page), { maxAgeMs: TTL.targets * 1000 });
    const valid = page === "forecast" ? parseStockAnalysisForecast(md) !== null : RATINGS_HEADER.test(md);
    if (!valid) throw new ParseError();
    return md;
  });

type NqKind = "analyst/targetprice" | "analyst/earnings-date" | "company/earnings-surprise" | "company/company-profile";
const nqRaw = (t: string, kind: NqKind, ttl: number) =>
  cached(`mkt:nq:${kind}:${t}`, ttl, () =>
    fetchJson(`https://api.nasdaq.com/api/${kind.split("/")[0]}/${toSourceSymbol(t, "nasdaq")}/${kind.split("/")[1]}`),
  );

async function benchCloses(sym: string, today: string): Promise<[string, number][]> {
  try {
    const closes = await cached(`mkt:bench:${sym}`, TTL.history, async () => {
      const p = parseYahooChart(await fetchJson(yahooUrl(sym)));
      if (!p) throw new Error("parse");
      return p.closes;
    });
    return closes.filter(([d]) => d <= today);
  } catch {
    return [];
  }
}

/** SPY only: beta needs nothing else. Shares the cache entry with getBenchmarks. */
export function getSpyCloses(now: Date = new Date()): Promise<[string, number][]> {
  return benchCloses("SPY", now.toISOString().slice(0, 10));
}

export async function getBenchmarks(now: Date = new Date()): Promise<{ SPY: [string, number][]; QQQ: [string, number][] }> {
  const today = now.toISOString().slice(0, 10);
  const [SPY, QQQ] = await Promise.all([benchCloses("SPY", today), benchCloses("QQQ", today)]);
  return { SPY, QQQ };
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

type Snap = { sp: TargetSet | null; zacks: TargetSet | null };

async function snapshots(t: string, today: string, cur: Snap): Promise<Snap | undefined> {
  const kv = getKv();
  if (cur.sp || cur.zacks) {
    try {
      await kv.set(`tgtsnap:${t}:${today}`, cur, SNAPSHOT_TTL);
    } catch {
      // best effort
    }
  }
  for (const back of [1, 2, 3]) {
    try {
      const s = await kv.get<Snap>(`tgtsnap:${t}:${addDays(today, -back)}`);
      if (s && typeof s === "object" && "sp" in s && "zacks" in s) return { sp: s.sp ?? null, zacks: s.zacks ?? null };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function mergeCalls(lists: Call[][]): Call[] {
  const seen = new Set<string>();
  const out: Call[] = [];
  for (const c of lists.flat()) {
    const k = `${c[0]}|${c[2]}|${c[1]}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c[2] < b.c[2] ? 1 : a.c[2] > b.c[2] ? -1 : a.i - b.i))
    .map((x) => x.c);
}

export async function getTickerMarket(ticker: string, now: Date = new Date()): Promise<TickerMarket> {
  const t = ticker.trim().toUpperCase().replace(/\./g, "-");
  if (!TICKER_RE.test(t)) throw new UnknownTicker(t);
  const today = now.toISOString().slice(0, 10);
  const kv = getKv();
  const negKey = `mkt:unknown:${t}`;
  try {
    if (await kv.get(negKey)) throw new UnknownTicker(t);
  } catch (e) {
    if (e instanceof UnknownTicker) throw e;
  }

  // Resolve Yahoo FIRST: unknown tickers and Yahoo outages must cost no Firecrawl credits and no Nasdaq calls.
  const [yahoo, spy] = await Promise.all([settle(yahooRaw(t)), getSpyCloses(now)]);

  const errors: Record<string, string> = {};

  // (a) Yahoo
  let chart: ReturnType<typeof parseYahooChart> = null;
  if (yahoo.ok) {
    chart = parseYahooChart(yahoo.v);
    if (!chart) errors.yahoo = "parse";
  } else {
    if (yahoo.e instanceof UnknownTicker) {
      try {
        await kv.set(negKey, { v: true }, TTL.negative);
      } catch {
        // best effort
      }
      throw yahoo.e;
    }
    errors.yahoo = codeOf(yahoo.e);
  }
  if (!chart) throw new NoPriceError(errors);

  const [saF, saR, nqT, nqD, nqS, nqP] = await Promise.all([
    settle(saRaw(t, "forecast")),
    settle(saRaw(t, "ratings")),
    settle(nqRaw(t, "analyst/targetprice", TTL.targets)),
    settle(nqRaw(t, "analyst/earnings-date", TTL.targets)),
    settle(nqRaw(t, "company/earnings-surprise", TTL.targets)),
    settle(nqRaw(t, "company/company-profile", TTL.profile)),
  ]);

  // (b) StockAnalysis
  let sp: TargetSet | null = null;
  const callLists: Call[][] = [];
  if (saF.ok) {
    const f = parseStockAnalysisForecast(saF.v);
    if (f) sp = f.sp;
    else errors.stockanalysis = "parse";
    callLists.push(parseStockAnalysisCalls(saF.v, today));
  } else errors.stockanalysis = codeOf(saF.e);
  if (saR.ok) callLists.push(parseStockAnalysisCalls(saR.v, today));
  else errors.stockanalysis ??= codeOf(saR.e);
  const calls = mergeCalls(callLists);

  // (c) Nasdaq / Zacks targets. `data: null` means no coverage, not an error.
  let zacks: TargetSet | null = null;
  if (nqT.ok) {
    zacks = parseNasdaqTargets(nqT.v);
    const noData = (nqT.v as { data?: unknown } | null)?.data === null;
    if (!zacks && !noData) errors.nasdaq_targets = "parse";
  } else errors.nasdaq_targets = codeOf(nqT.e);

  // (d) Earnings
  let next: TickerMarket["next"];
  if (nqD.ok) next = parseNasdaqEarningsDate(nqD.v, today) ?? undefined;
  else errors.nasdaq_earnings = codeOf(nqD.e);
  let er: TickerMarket["er"];
  if (nqS.ok) {
    const hist = computeEarningsMoves(parseNasdaqEarningsSurprise(nqS.v), chart.closes);
    if (hist.length) er = { hist };
  } else errors.nasdaq_earnings ??= codeOf(nqS.e);

  // (e) Sector
  let sector: string | undefined;
  if (nqP.ok) sector = parseNasdaqProfile(nqP.v)?.sector;
  else errors.nasdaq_profile = codeOf(nqP.e);

  // Beta (raw, vs SPY)
  let beta: number | null = null;
  if (spy.length) beta = computeBeta(chart.closes, spy);
  if (beta === null) errors.beta = spy.length ? "no_data" : "unavailable";

  const prevTargets = await snapshots(t, today, { sp, zacks });

  const out: TickerMarket = {
    ticker: t,
    name: chart.name,
    price: chart.price,
    prevClose: chart.prevClose,
    beta,
    sp,
    zacks,
    calls,
    closes: chart.closes,
    errors,
  };
  if (sector) out.sector = sector;
  if (prevTargets) out.prevTargets = prevTargets;
  // tgtDate: date of the newest named call, a proxy for "last target update".
  if (calls.length) out.tgtDate = calls[0][2];
  if (next) out.next = next;
  if (er) out.er = er;
  return out;
}
