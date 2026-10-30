import type { Call, TickerMarket } from "@/lib/types";

export type TargetView = {
  cons: number | null;
  rc: number | null;
  spread: number;
  k: 0.75 | 0.6 | 0.4;
  hc: number | null;
  ab: number;
  up: number | null;
  upH: number | null;
  upL: number | null;
  upB: number | null;
  age: number | null;
  lowc: boolean;
  covered: boolean;
};

const DAY = 864e5;
const utc = (d: string): number => Date.parse(`${d}T00:00:00Z`);

function median(a: number[]): number {
  const s = a.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function blendTargets(
  calls: Call[],
  asof: string,
  sp: number | null,
  zacks: number | null,
): {
  cons: number | null;
  rc: number | null;
  nc: number;
  np: number;
  callLo: number | null;
  callHi: number | null;
} {
  const t0 = utc(asof);
  const cs = (calls ?? [])
    .filter((c) => c[2] <= asof && (t0 - utc(c[2])) / DAY <= 60)
    .map((c) => c[1]);
  const rc = cs.length >= 3 ? median(cs) : null;
  const parts = [sp, zacks, rc].filter((x): x is number => x != null);
  return {
    cons: parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null,
    rc,
    nc: cs.length,
    np: parts.length,
    callLo: cs.length ? Math.min(...cs) : null,
    callHi: cs.length ? Math.max(...cs) : null,
  };
}

export function deriveTarget(m: TickerMarket, asof: string): TargetView {
  const n = m.sp?.n ?? 0;
  const k: 0.75 | 0.6 | 0.4 = n >= 20 ? 0.75 : n >= 8 ? 0.6 : 0.4;
  const spAvg = m.sp?.avg ?? null;
  const zAvg = m.zacks?.avg ?? null;
  const b = blendTargets(m.calls, asof, spAvg, zAvg);
  const cons = b.cons;
  const covered = cons !== null;

  const srcs = [spAvg, zAvg, b.rc].filter((x): x is number => x != null);
  const spread = srcs.length > 1 ? Math.max(...srcs) / Math.min(...srcs) - 1 : 0;

  const age = m.tgtDate ? Math.round((utc(asof) - utc(m.tgtDate)) / DAY) : null;
  const ab = m.beta != null ? 0.67 * m.beta + 0.33 : 1;
  const price = m.price;

  const hc = cons === null ? null : cons < price ? cons : price + k * (cons - price);
  const ratio = (x: number | null | undefined): number | null =>
    x == null || !(price > 0) ? null : x / price - 1;

  return {
    cons,
    rc: b.rc,
    spread,
    k,
    hc,
    ab,
    up: ratio(cons),
    upH: ratio(hc),
    upL: ratio(m.sp?.low),
    upB: ratio(m.sp?.high),
    age,
    lowc: n < 8 || !!m.modeled || spread > 0.15 || (age !== null && age > 30) || !covered,
    covered,
  };
}

export function targetStatus(
  price: number,
  v: TargetView,
  low: number,
  high: number,
): { label: string; tone: "hot" | "cold" | "" } {
  if (v.up === null) return { label: "No Street target", tone: "" };
  if (price > high) return { label: "▲ Above Street high", tone: "hot" };
  if (price < low) return { label: "▼ Below Street low", tone: "cold" };
  if (v.up < 0) return { label: "Above Street average", tone: "hot" };
  if (v.up < 0.1) return { label: "Near average", tone: "" };
  if (v.up < 0.3) return { label: "Room to average", tone: "" };
  return { label: "Wide gap to average", tone: "" };
}
