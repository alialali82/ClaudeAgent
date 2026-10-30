import type { Position } from "./portfolio";
import type { TargetView } from "./targets";

export type ScenarioKey = "low" | "hc" | "cons" | "high";
export type Scenario = {
  key: ScenarioKey;
  value: number;
  ret: number;
  driver: { ticker: string; delta: number };
  exLargest: number | null;
};

const FIELD: Record<ScenarioKey, "upL" | "upH" | "up" | "upB"> = {
  low: "upL",
  hc: "upH",
  cons: "up",
  high: "upB",
};

export function scenarios(
  positions: Position[],
  views: Record<string, TargetView>,
  total: number,
): Scenario[] {
  const largest = positions.reduce<Position | null>(
    (a, p) =>
      !a || p.value > a.value || (p.value === a.value && p.ticker < a.ticker)
        ? p
        : a,
    null,
  );
  return (["low", "hc", "cons", "high"] as const).map((key) => {
    const upOf = (p: Position): number => {
      const u = views[p.ticker]?.[FIELD[key]];
      return u != null && Number.isFinite(u) ? u : 0;
    };
    let value = 0;
    let driver = { ticker: "", delta: 0 };
    for (const p of positions) {
      const delta = p.value * upOf(p);
      value += p.value + delta;
      if (
        !driver.ticker ||
        Math.abs(delta) > Math.abs(driver.delta) ||
        (Math.abs(delta) === Math.abs(driver.delta) && p.ticker < driver.ticker)
      )
        driver = { ticker: p.ticker, delta };
    }
    const rest = largest ? total - largest.value : 0;
    const exLargest =
      largest && rest > 0
        ? (value - largest.value * (1 + upOf(largest))) / rest - 1
        : null;
    return {
      key,
      value,
      ret: total > 0 ? value / total - 1 : 0,
      driver,
      exLargest,
    };
  });
}
