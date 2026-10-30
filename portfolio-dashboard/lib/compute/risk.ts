import type { TickerMarket } from "@/lib/types";
import type { Position } from "./portfolio";
import type { TargetView } from "./targets";

const sum = <T>(xs: T[], f: (x: T) => number): number =>
  xs.reduce((a, x) => a + f(x), 0);
const frac = (n: number, d: number): number => (d > 0 ? n / d : 0);
const byValueDesc = (a: Position, b: Position): number =>
  b.value - a.value || a.ticker.localeCompare(b.ticker);

export function concentration(
  positions: Position[],
  total: number,
  limit: number,
): { over: Position[]; excess: number; top5: number } {
  const sorted = positions.slice().sort(byValueDesc);
  const over = sorted.filter((p) => frac(p.value, total) > limit);
  const excess = sum(over, (p) => p.value - limit * total);
  const top5 = sum(sorted.slice(0, 5), (p) => frac(p.value, total));
  return { over, excess, top5 };
}

function avgMove(m: TickerMarket | undefined): number | null {
  const moves = (m?.er?.hist ?? [])
    .map((h) => h[2])
    .filter((x): x is number => x != null && Number.isFinite(x));
  return moves.length ? sum(moves, Math.abs) / moves.length : null;
}

export function shocks(
  positions: Position[],
  views: Record<string, TargetView>,
  total: number,
  market: Record<string, TickerMarket>,
): { label: string; amount: number; note: string }[] {
  if (!positions.length) return [];
  const big = positions.slice().sort(byValueDesc)[0];
  const t = big.ticker;

  const secs = new Map<string, { value: number; n: number }>();
  for (const p of positions) {
    const s = secs.get(p.sector) ?? { value: 0, n: 0 };
    s.value += p.value;
    s.n += 1;
    secs.set(p.sector, s);
  }
  const [secName, sec] = [...secs.entries()].sort(
    (a, b) => b[1].value - a[1].value || a[0].localeCompare(b[0]),
  )[0];

  const ab = (p: Position): number => views[p.ticker]?.ab ?? 1;
  const beta = sum(positions, (p) => frac(p.value, total) * ab(p));
  const mv = avgMove(market[t]);

  return [
    {
      label: `${t} falls 10%`,
      amount: -big.value * 0.1,
      note: `${t} is ${(frac(big.value, total) * 100).toFixed(1)}% of the portfolio`,
    },
    {
      label: `${t} falls 20%`,
      amount: -big.value * 0.2,
      note:
        mv === null
          ? "Its earnings reaction is unknown"
          : `Its last four results moved it ±${mv.toFixed(1)}% on average`,
    },
    {
      label: `${secName} falls 20%`,
      amount: -sec.value * 0.2,
      note: `${sec.n} holdings, ${(frac(sec.value, total) * 100).toFixed(0)}% of value`,
    },
    {
      label: "Market falls 10%",
      amount: -sum(positions, (p) => p.value * ab(p) * 0.1),
      note: `Using each stock's 1-year beta; portfolio beta ${beta.toFixed(2)}`,
    },
  ];
}
