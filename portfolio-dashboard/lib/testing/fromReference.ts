import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Call, TickerMarket } from "@/lib/types";

export type ReferenceTicker = {
  name: string;
  sector?: string;
  price: number;
  cons: number;
  low: number;
  high: number;
  n: number;
  src?: string;
  tgt?: string;
  prev: { price: number; cons: number; low: number; high: number; zacks: number | null };
  next?: { date: string; what: string; conf: boolean };
  events?: { date: string; what: string; conf: boolean }[];
  beta?: number | null;
  zacks?: { cons: number; low: number; high: number };
  calls: Call[];
  er?: { hist: [string, number | null, number | null][] };
  modeled?: boolean;
  disputed?: boolean;
};

export function fromReference(key: string, t: ReferenceTicker): TickerMarket {
  return {
    ticker: key,
    name: t.name,
    sector: t.sector,
    price: t.price,
    prevClose: t.prev.price,
    beta: t.beta,
    sp: { avg: t.cons, low: t.low, high: t.high, n: t.n },
    zacks: t.zacks ? { avg: t.zacks.cons, low: t.zacks.low, high: t.zacks.high } : null,
    prevTargets: {
      sp: { avg: t.prev.cons, low: t.prev.low, high: t.prev.high },
      zacks:
        t.prev.zacks != null
          ? { avg: t.prev.zacks, low: t.prev.zacks, high: t.prev.zacks }
          : null,
    },
    calls: t.calls,
    tgtDate: t.tgt,
    modeled: t.modeled,
    next: t.next,
    events: t.events,
    er: t.er ? { hist: t.er.hist } : undefined,
    closes: [],
    errors: {},
  };
}

export function loadReferenceMarket(): {
  asof: string;
  prevAsof: string;
  market: Record<string, TickerMarket>;
} {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures/market-2026-10-07.json"), "utf8"),
  ) as { asof: string; prevAsof: string; tickers: Record<string, ReferenceTicker> };
  const market: Record<string, TickerMarket> = {};
  for (const [k, t] of Object.entries(raw.tickers)) market[k] = fromReference(k, t);
  return { asof: raw.asof, prevAsof: raw.prevAsof, market };
}
