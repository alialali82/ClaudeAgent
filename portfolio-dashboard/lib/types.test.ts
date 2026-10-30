import { describe, expect, it } from "vitest";
import type { Call, Holding, TargetSet, TickerMarket } from "@/lib/types";

describe("types", () => {
  it("accepts sample values", () => {
    const holding = { ticker: "AAPL", shares: 10, cost: 1500, costKind: "total" } satisfies Holding;
    const call = ["Acme Securities", 200, "2026-01-15"] satisfies Call;
    const set = { avg: 200, low: 150, high: 250 } satisfies TargetSet;
    const market = {
      ticker: "AAPL",
      name: "Apple Inc.",
      price: 190,
      prevClose: 188,
      sp: set,
      zacks: null,
      calls: [call],
      closes: [["2026-01-14", 188]],
      errors: {},
    } satisfies TickerMarket;
    expect(holding.ticker).toBe(market.ticker);
  });
});
