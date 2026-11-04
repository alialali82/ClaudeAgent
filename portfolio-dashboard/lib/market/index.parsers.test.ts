import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryKv, setKvForTests } from "@/lib/kv";

const flags = vi.hoisted(() => ({ yahoo: false }));
vi.mock("@/lib/guard/spend", () => ({ spendAllowed: vi.fn(async () => true) }));
vi.mock("./stockanalysis", () => ({
  parseStockAnalysisForecast: () => {
    throw new Error("boom");
  },
  parseStockAnalysisCalls: () => {
    throw new Error("boom");
  },
}));
vi.mock("./nasdaq", () => ({
  parseNasdaqTargets: () => {
    throw new Error("boom");
  },
  parseNasdaqProfile: () => {
    throw new Error("boom");
  },
}));
vi.mock("./earnings", () => ({
  parseNasdaqEarningsDate: () => {
    throw new Error("boom");
  },
  parseNasdaqEarningsSurprise: () => {
    throw new Error("boom");
  },
  computeEarningsMoves: () => {
    throw new Error("boom");
  },
}));
vi.mock("./yahoo", async (orig) => {
  const real = await orig<typeof import("./yahoo")>();
  return {
    parseYahooChart: (j: unknown) => {
      if (flags.yahoo) throw new Error("boom");
      return real.parseYahooChart(j);
    },
  };
});
import { getTickerMarket, NoPriceError } from "./index";

const read = (n: string) => readFileSync(fileURLToPath(new URL(`./__fixtures__/${n}`, import.meta.url)), "utf8");
const NOW = new Date("2026-11-04T15:00:00Z");

beforeEach(() => {
  setKvForTests(createMemoryKv());
  process.env.FIRECRAWL_API_KEY = "fc-test";
  flags.yahoo = false;
  vi.stubGlobal("fetch", async (u: string) => {
    if (u.includes("yahoo")) return new Response(read("yahoo-chart-nvda.json"));
    if (u.includes("firecrawl"))
      return new Response(JSON.stringify({ success: true, data: { markdown: read("stockanalysis-forecast-nvda.md") } }));
    return new Response(read("nasdaq-targetprice-nvda.json"));
  });
});
afterEach(() => {
  setKvForTests(null);
  vi.unstubAllGlobals();
  delete process.env.FIRECRAWL_API_KEY;
});

describe("throwing parsers fail only their own source", () => {
  it("every non-Yahoo parser throwing yields parse codes and an intact price", async () => {
    const m = await getTickerMarket("NVDA", NOW);
    expect(m.price).toBe(202.35);
    expect(m.sp).toBeNull();
    expect(m.zacks).toBeNull();
    expect(m.calls).toEqual([]);
    expect(m.errors.stockanalysis).toBe("parse");
    expect(m.errors.nasdaq_targets).toBe("parse");
    expect(m.errors.nasdaq_earnings).toBe("parse");
    expect(m.errors.nasdaq_profile).toBe("parse");
  });
  it("a throwing Yahoo parser gives NoPriceError with errors.yahoo = parse", async () => {
    flags.yahoo = true;
    const e = (await getTickerMarket("NVDA", NOW).catch((x) => x)) as NoPriceError;
    expect(e).toBeInstanceOf(NoPriceError);
    expect(e.errors.yahoo).toBe("parse");
  });
});
