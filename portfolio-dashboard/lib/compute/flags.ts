import { fd, pct, usd0, usd2 } from "@/lib/format";
import type { TickerMarket } from "@/lib/types";
import type { CalEvent } from "./calendar";
import type { Position } from "./portfolio";
import type { TargetView } from "./targets";

export type Flag = { tone: "hot" | "cold" | "info"; key: string; text: string };
export type ChangeRow = { key: string; text: string };

const EPS = 1e-9;

export function buildFlags(
  positions: Position[],
  views: Record<string, TargetView | undefined>,
  market: Record<string, TickerMarket | undefined>,
  calendar: { events: CalEvent[]; next14: CalEvent[] },
  total: number,
): Flag[] {
  if (!positions.length) return [];
  const out: Flag[] = [];
  const byTicker = new Map(positions.map((p) => [p.ticker, p]));
  const rows = positions.flatMap((p) => {
    const m = market[p.ticker];
    const v = views[p.ticker];
    return m && v ? [{ p, m, v }] : [];
  });
  const share = (x: number) => (total > 0 ? ((x / total) * 100).toFixed(1) : "0.0");

  for (const e of calendar.next14) {
    if (e.kind !== "results" || !Number.isFinite(e.days)) continue;
    const p = byTicker.get(e.ticker);
    if (!p || !market[e.ticker]) continue;
    const when = e.days === 0 ? "today" : e.days === 1 ? "tomorrow" : `in ${e.days} days`;
    const what = e.what.replace(/^.*results,?\s*/i, "") || "date set";
    out.push({
      tone: "hot",
      key: "Results",
      text: `${e.ticker} reports ${when} (${fd(e.date)}, ${what}). A 10% move is ±${usd0(p.value * 0.1)} on your ${p.qty} shares.`,
    });
  }

  const below = rows.filter(({ m }) => m.sp && m.price < m.sp.low);
  if (below.length) {
    const v = below.reduce((s, r) => s + r.p.value, 0);
    out.push({
      tone: "cold",
      key: "Below every target",
      text: `${below.map((r) => r.p.ticker).join(", ")} trade below their lowest published target (analysts have not cut that far, or the price has overshot) — ${usd0(v)}, ${share(v)}% of the portfolio.`,
    });
  }

  const aboveHigh = rows.filter(({ m }) => m.sp && m.price > m.sp.high);
  const aboveAvg = rows.filter(
    ({ m, v }) => m.sp && m.price <= m.sp.high && v.up != null && v.up < 0,
  );
  if (aboveHigh.length || aboveAvg.length) {
    const parts: string[] = [];
    if (aboveHigh.length)
      parts.push(`${aboveHigh.map((r) => r.p.ticker).join(", ")} above the highest target`);
    if (aboveAvg.length)
      parts.push(`${aboveAvg.map((r) => r.p.ticker).join(", ")} above the average`);
    out.push({ tone: "hot", key: "Above the Street", text: `${parts.join("; ")}.` });
  }

  const top = positions.slice().sort((a, b) => b.value - a.value);
  const top5 = top.slice(0, 5).reduce((s, p) => s + p.w, 0);
  const topUp = views[top[0].ticker]?.up;
  out.push({
    tone: "info",
    key: "Concentration",
    text:
      `${top[0].ticker} is ${(top[0].w * 100).toFixed(1)}% of the portfolio; the top five are ${(top5 * 100).toFixed(0)}%.` +
      (topUp != null ? ` Its Street average is only ${pct(topUp)} away.` : ""),
  });

  const diverge = rows.filter(
    ({ m, v }) =>
      v.rc != null && m.sp != null && typeof m.sp.avg === "number" && m.sp.avg !== 0 &&
      Math.abs(v.rc / m.sp.avg - 1) > 0.1 + EPS,
  );
  if (diverge.length)
    out.push({
      tone: "info",
      key: "Targets diverge",
      text: `Recent named calls differ from the S&P tracker by more than 10% on ${diverge
        .map((r) => `${r.p.ticker} (${pct((r.v.rc as number) / (r.m.sp?.avg as number) - 1, 0)})`)
        .join(", ")}. The blended average splits the difference.`,
    });

  const weak = rows.filter(({ v }) => v.lowc);
  if (weak.length)
    out.push({
      tone: "info",
      key: "Weak targets",
      text: `Treat targets for ${weak.map((r) => r.p.ticker).join(", ")} with caution: thin coverage, sources more than 15% apart, or stale.`,
    });

  return out;
}

type StatusKey = "aboveHigh" | "belowLow" | "aboveAvg" | "below";
const STATUS_LABEL: Record<StatusKey, string> = {
  aboveHigh: "above its highest target",
  belowLow: "below its lowest target",
  aboveAvg: "above its average target",
  below: "below its average target",
};
function statusKey(price: number, low: number, high: number, cons: number): StatusKey {
  return price > high ? "aboveHigh" : price < low ? "belowLow" : price > cons ? "aboveAvg" : "below";
}

export function buildChanges(
  positions: Position[],
  market: Record<string, TickerMarket | undefined>,
  views: Record<string, TargetView | undefined>,
  prevViews: Record<string, TargetView | undefined>,
  calendar: { events: CalEvent[]; next14: CalEvent[] },
): ChangeRow[] {
  const ch: ChangeRow[] = [];
  for (const p of positions) {
    const t = p.ticker;
    const m = market[t];
    if (!m) continue;
    const v = views[t];
    const pv = prevViews[t];

    if (v && pv && v.cons != null && pv.cons != null && pv.cons > 0) {
      const mv = v.cons / pv.cons - 1;
      const head = `${t} Street average ${usd2(pv.cons)} → ${usd2(v.cons)} (${pct(mv)})`;
      if (Math.abs(mv) >= 0.05) ch.push({ key: "Target ≥5%", text: `${head}.` });
      else if (Math.abs(mv) >= 0.01)
        ch.push({ key: "Target moved", text: `${head}, under the 5% flag.` });
    }

    const prevSp = m.prevTargets?.sp;
    if (prevSp && m.sp && !m.modeled && (prevSp.low !== m.sp.low || prevSp.high !== m.sp.high))
      ch.push({
        key: "Range",
        text: `${t} target range now ${usd2(m.sp.low)}–${usd2(m.sp.high)} (was ${usd2(prevSp.low)}–${usd2(prevSp.high)}).`,
      });

    if (v && pv && m.sp && v.cons != null && pv.cons != null) {
      // Without a stored previous range, fall back to the current one.
      const pl = prevSp?.low ?? m.sp.low;
      const ph = prevSp?.high ?? m.sp.high;
      const a = statusKey(m.prevClose, pl, ph, pv.cons);
      const b = statusKey(m.price, m.sp.low, m.sp.high, v.cons);
      if (a !== b)
        ch.push({ key: "Crossed", text: `${t} moved from ${STATUS_LABEL[a]} to ${STATUS_LABEL[b]}.` });
    }

    for (const l of p.lots) {
      if (typeof l.cost !== "number" || !(l.cost > 0) || !(l.shares > 0)) continue;
      const avg = l.cost / l.shares;
      const was = m.prevClose >= avg;
      const is = m.price >= avg;
      if (was !== is)
        ch.push({
          key: "Cost",
          text: `${t}${l.account ? ` (${l.account})` : ""} is now ${is ? "above" : "below"} your ${usd2(avg)} cost.`,
        });
    }
  }

  const soon = calendar.next14.filter((e) => e.kind === "results" && Number.isFinite(e.days));
  ch.push({
    key: "Next 14 days",
    text: soon.length
      ? `${soon.map((e) => `${e.ticker} results ${fd(e.date)}`).join("; ")}.`
      : "No results scheduled.",
  });
  if (!ch.some((c) => c.key === "Target ≥5%"))
    ch.unshift({ key: "Targets", text: "No Street average moved 5% or more." });
  return ch;
}
