import { daysBetween } from "@/lib/format";
import type { TickerMarket } from "@/lib/types";
import type { Position } from "./portfolio";

export type CalEvent = {
  ticker: string;
  date: string;
  what: string;
  conf: boolean;
  kind: "results" | "event";
  days: number;
};

export function buildCalendar(
  positions: Position[],
  market: Record<string, TickerMarket>,
  today: string,
): { events: CalEvent[]; next14: CalEvent[] } {
  const events: CalEvent[] = [];
  const seen = new Set<string>();
  for (const p of positions) {
    if (seen.has(p.ticker)) continue;
    seen.add(p.ticker);
    const m = market[p.ticker];
    if (!m) continue;
    const add = (e: { date: string; what: string; conf: boolean }, kind: CalEvent["kind"]) => {
      const days = daysBetween(today, e.date);
      if (days < 0) return;
      events.push({ ticker: p.ticker, date: e.date, what: e.what, conf: e.conf, kind, days });
    };
    if (m.next) add(m.next, "results");
    for (const e of m.events ?? []) add(e, "event");
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));
  return { events, next14: events.filter((e) => e.kind === "results" && e.days <= 14) };
}
