import { buildCalendar, type CalEvent } from "@/lib/compute/calendar";
import { buildChanges, buildFlags, type ChangeRow, type Flag } from "@/lib/compute/flags";
import { buildPerformance, type Performance } from "@/lib/compute/performance";
import { buildPortfolio, type Portfolio, type Position } from "@/lib/compute/portfolio";
import { concentration, shocks } from "@/lib/compute/risk";
import { scenarios, type Scenario } from "@/lib/compute/scenarios";
import { deriveTarget, type TargetView } from "@/lib/compute/targets";
import type { Holding, TickerMarket } from "@/lib/types";

type Series = [string, number][];
export type Benchmarks = { SPY: Series; QQQ: Series };

export type DashboardPosition = Position & {
  view: TargetView;
  market: Omit<TickerMarket, "closes">;
};

export type Dashboard = {
  asof: string;
  prevAsof: string;
  total: number;
  cost: number | null;
  /** Value of the lots that have a cost; the numerator for the portfolio return. */
  costedValue: number;
  prev: number;
  accounts: Portfolio["accounts"];
  sectors: Portfolio["sectors"];
  positions: DashboardPosition[];
  flags: Flag[];
  changes: ChangeRow[];
  calendar: { events: CalEvent[]; next14: CalEvent[] };
  risk: {
    concentration: { over: string[]; excess: number; top5: number; limit: number };
    shocks: ReturnType<typeof shocks>;
  };
  scenarios: Scenario[];
  performance: Performance | null;
  unpriced: string[];
  failures: { ticker: string; code: string }[];
  sourceNotes: { ticker: string; missing: string[] }[];
  generatedAt: string;
};

const CONCENTRATION_LIMIT = 0.15;

/** Most common value; ties go to the latest date. */
function mode(dates: string[]): string | null {
  const n = new Map<string, number>();
  for (const d of dates) n.set(d, (n.get(d) ?? 0) + 1);
  let best: string | null = null;
  for (const [d, c] of n) {
    if (best === null || c > (n.get(best) ?? 0) || (c === (n.get(best) ?? 0) && d > best)) best = d;
  }
  return best;
}

const isPriced = (m: TickerMarket | undefined): m is TickerMarket =>
  !!m && Number.isFinite(m.price) && m.price > 0;

export function buildDashboard(
  holdings: Holding[],
  market: Record<string, TickerMarket>,
  bench: Benchmarks,
  today: string,
  failed: Record<string, string> = {},
): Dashboard {
  const priced = Object.values(market).filter(isPriced);
  const last = priced.map((m) => m.closes.at(-1)?.[0]).filter((d): d is string => !!d);
  const asof = mode(last) ?? today;
  const prevs = priced.map((m) => m.closes.at(-2)?.[0]).filter((d): d is string => !!d);
  const prevAsof = mode(prevs) ?? asof;

  const pf = buildPortfolio(holdings, market);

  const views: Record<string, TargetView> = {};
  const prevViews: Record<string, TargetView> = {};
  for (const p of pf.positions) {
    const m = market[p.ticker];
    views[p.ticker] = deriveTarget(m, asof);
    if (m.prevTargets) {
      prevViews[p.ticker] = deriveTarget(
        { ...m, sp: m.prevTargets.sp, zacks: m.prevTargets.zacks, price: m.prevClose },
        prevAsof,
      );
    }
  }

  const calendar = buildCalendar(pf.positions, market, today);
  const flags = buildFlags(pf.positions, views, market, calendar, pf.total);
  const changes = buildChanges(pf.positions, market, views, prevViews, calendar);

  const conc = concentration(pf.positions, pf.total, CONCENTRATION_LIMIT);
  const closes: Record<string, Series> = {};
  for (const p of pf.positions) closes[p.ticker] = market[p.ticker].closes;

  const positions: DashboardPosition[] = pf.positions.map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { closes: _closes, ...rest } = market[p.ticker];
    return { ...p, view: views[p.ticker], market: rest };
  });

  const costedValue = pf.lots.reduce((a, l) => (l.cost !== null ? a + l.value : a), 0);

  return {
    asof,
    prevAsof,
    total: pf.total,
    cost: pf.cost,
    costedValue,
    prev: pf.prev,
    accounts: pf.accounts,
    sectors: pf.sectors,
    positions,
    flags,
    changes,
    calendar,
    risk: {
      concentration: {
        over: conc.over.map((p) => p.ticker),
        excess: conc.excess,
        top5: conc.top5,
        limit: CONCENTRATION_LIMIT,
      },
      shocks: shocks(pf.positions, views, pf.total, market),
    },
    scenarios: scenarios(pf.positions, views, pf.total),
    performance: buildPerformance(pf.lots, closes, bench, asof),
    unpriced: pf.unpriced,
    failures: Object.entries(failed)
      .map(([ticker, code]) => ({ ticker, code }))
      .sort((a, b) => a.ticker.localeCompare(b.ticker)),
    sourceNotes: Object.values(market)
      .filter((m) => Object.keys(m.errors ?? {}).length > 0)
      .map((m) => ({ ticker: m.ticker, missing: Object.keys(m.errors).sort() }))
      .sort((a, b) => a.ticker.localeCompare(b.ticker)),
    generatedAt: `${today}T00:00:00Z`,
  };
}
