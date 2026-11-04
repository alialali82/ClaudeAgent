import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseNasdaqTargets } from "./nasdaq";

const fx = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8"));

const nvda = fx("nasdaq-targetprice-nvda.json");
const wrap = (o: Record<string, unknown>) => ({ data: { consensusOverview: o } });

describe("parseNasdaqTargets", () => {
  it("parses the NVDA Zacks consensus (no analyst count in this endpoint)", () => {
    expect(parseNasdaqTargets(nvda)).toEqual({ avg: 322.5, low: 275, high: 465 });
  });

  it("parses currency strings", () => {
    expect(parseNasdaqTargets(wrap({ lowPriceTarget: "$275.00", highPriceTarget: "1,465", priceTarget: "$324.20" }))).toEqual({
      avg: 324.2,
      low: 275,
      high: 1465,
    });
  });

  it("passes n through when present and sane", () => {
    expect(parseNasdaqTargets(wrap({ lowPriceTarget: 1, highPriceTarget: 3, priceTarget: 2, n: 7 }))).toEqual({ avg: 2, low: 1, high: 3, n: 7 });
    expect(parseNasdaqTargets(wrap({ lowPriceTarget: 1, highPriceTarget: 3, priceTarget: 2, n: "x" }))).toEqual({ avg: 2, low: 1, high: 3 });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "<html>error</html>"],
    ["empty object", {}],
    ["unknown symbol (data null)", { data: null, status: { rCode: 400 } }],
    ["no consensusOverview", { data: {} }],
    ["consensusOverview null", { data: { consensusOverview: null } }],
    ["empty consensusOverview", wrap({})],
    ["array", []],
  ])("returns null for %s", (_n, input) => {
    expect(parseNasdaqTargets(input)).toBeNull();
  });

  it.each([
    ["NaN", NaN],
    ["n/a", "n/a"],
    ["empty", ""],
    ["null", null],
    ["Infinity", Infinity],
  ])("returns null when a number is %s", (_n, bad) => {
    expect(parseNasdaqTargets(wrap({ lowPriceTarget: 1, highPriceTarget: 3, priceTarget: bad }))).toBeNull();
    expect(parseNasdaqTargets(wrap({ lowPriceTarget: bad, highPriceTarget: 3, priceTarget: 2 }))).toBeNull();
  });

  it("returns null for inconsistent or non-positive values", () => {
    expect(parseNasdaqTargets(wrap({ lowPriceTarget: 5, highPriceTarget: 3, priceTarget: 4 }))).toBeNull();
    expect(parseNasdaqTargets(wrap({ lowPriceTarget: 1, highPriceTarget: 3, priceTarget: 9 }))).toBeNull();
    expect(parseNasdaqTargets(wrap({ lowPriceTarget: 0, highPriceTarget: 3, priceTarget: 2 }))).toBeNull();
  });

  it("returns null for a truncated JSON-derived object", () => {
    expect(parseNasdaqTargets({ data: { symbol: "nvda" } })).toBeNull();
  });
});
