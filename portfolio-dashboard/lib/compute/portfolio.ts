import type { Holding, TickerMarket } from "@/lib/types";

export type Lot = Omit<Holding, "cost"> & {
  value: number;
  prevValue: number;
  cost: number | null;
  pl: number | null;
  ret: number | null;
};

export type Position = {
  ticker: string;
  name: string;
  sector: string;
  lots: Lot[];
  qty: number;
  value: number;
  cost: number | null;
  ret: number | null;
  w: number;
  dayUsd: number;
  day: number;
};

export type Portfolio = {
  lots: Lot[];
  positions: Position[];
  total: number;
  cost: number | null;
  prev: number;
  accounts: { name: string; value: number; cost: number | null }[];
  sectors: {
    name: string;
    value: number;
    cost: number | null;
    tickers: string[];
  }[];
  unpriced: string[];
};

const sum = <T>(xs: T[], f: (x: T) => number): number =>
  xs.reduce((a, x) => a + f(x), 0);

/** Sum of known lot costs, or null when no lot has a cost. */
function knownCost(lots: Lot[]): number | null {
  const known = lots.filter((l) => l.cost !== null);
  return known.length ? sum(known, (l) => l.cost as number) : null;
}

const byValueDesc = <T extends { value: number }>(
  a: T,
  b: T,
  key: (x: T) => string,
): number => b.value - a.value || key(a).localeCompare(key(b));

function lotCost(h: Holding): number | null {
  if (typeof h.cost !== "number" || !Number.isFinite(h.cost)) return null;
  return h.costKind === "perShare" ? h.cost * h.shares : h.cost;
}

export function buildPortfolio(
  holdings: Holding[],
  market: Record<string, TickerMarket>,
): Portfolio {
  const lots: Lot[] = [];
  const unpriced: string[] = [];

  for (const h of holdings) {
    if (!Number.isFinite(h.shares) || h.shares <= 0) continue;
    const m = market[h.ticker];
    if (!m || !Number.isFinite(m.price) || !(m.price > 0)) {
      if (!unpriced.includes(h.ticker)) unpriced.push(h.ticker);
      continue;
    }
    const value = h.shares * m.price;
    const prevValue = h.shares * (m.prevClose > 0 ? m.prevClose : m.price);
    const cost = lotCost(h);
    lots.push({
      ...h,
      value,
      prevValue,
      cost,
      pl: cost === null ? null : value - cost,
      ret: cost !== null && cost > 0 ? value / cost - 1 : null,
    });
  }

  const total = sum(lots, (l) => l.value);
  const prev = sum(lots, (l) => l.prevValue);

  const byTicker = new Map<string, Lot[]>();
  for (const l of lots) {
    const arr = byTicker.get(l.ticker);
    if (arr) arr.push(l);
    else byTicker.set(l.ticker, [l]);
  }

  const positions: Position[] = [...byTicker.entries()].map(([ticker, ls]) => {
    const m = market[ticker];
    const value = sum(ls, (l) => l.value);
    const cost = knownCost(ls);
    const costed = ls.filter((l) => l.cost !== null);
    return {
      ticker,
      name: m.name,
      sector: m.sector ?? "Other",
      lots: ls,
      qty: sum(ls, (l) => l.shares),
      value,
      cost,
      ret:
        cost !== null && cost > 0
          ? sum(costed, (l) => l.value) / cost - 1
          : null,
      w: total > 0 ? value / total : 0,
      dayUsd: value - sum(ls, (l) => l.prevValue),
      day: m.prevClose > 0 ? m.price / m.prevClose - 1 : 0,
    };
  });
  positions.sort((a, b) => byValueDesc(a, b, (x) => x.ticker));

  const acc = new Map<string, Lot[]>();
  for (const l of lots) {
    const k = l.account ?? "Portfolio";
    const arr = acc.get(k);
    if (arr) arr.push(l);
    else acc.set(k, [l]);
  }
  const accounts = [...acc.entries()]
    .map(([name, ls]) => ({
      name,
      value: sum(ls, (l) => l.value),
      cost: knownCost(ls),
    }))
    .sort((a, b) => byValueDesc(a, b, (x) => x.name));

  const sec = new Map<string, Position[]>();
  for (const p of positions) {
    const arr = sec.get(p.sector);
    if (arr) arr.push(p);
    else sec.set(p.sector, [p]);
  }
  const sectors = [...sec.entries()]
    .map(([name, ps]) => ({
      name,
      value: sum(ps, (p) => p.value),
      cost: knownCost(ps.flatMap((p) => p.lots)),
      tickers: ps.map((p) => p.ticker), // positions already value-sorted
    }))
    .sort((a, b) => byValueDesc(a, b, (x) => x.name));

  return {
    lots,
    positions,
    total,
    cost: knownCost(lots),
    prev,
    accounts,
    sectors,
    unpriced,
  };
}
