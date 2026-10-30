import { describe, expect, it } from "vitest";
import {
  guessColumns,
  findHeaderRow,
  mergeDuplicates,
  normalizeTicker,
  parseNumber,
  parseSheet,
} from "./normalize";
import type { Holding } from "../types";

describe("normalizeTicker", () => {
  it.each([
    ["BRK.B", "BRK-B"],
    ["brk b", "BRK-B"],
    ["brk-b", "BRK-B"],
    ["BRK/B", "BRK-B"],
    ["BRK-B", "BRK-B"],
    ["$NVDA", "NVDA"],
    ["NVDA.US", "NVDA"],
    ["NVDA:US", "NVDA"],
    ["NVDA US", "NVDA"],
    [" aapl ", "AAPL"],
    ["NASDAQ:NVDA", "NVDA"],
    ["NYSE:KO", "KO"],
  ])("normalizes %j to %j", (raw, expected) => {
    expect(normalizeTicker(raw)).toBe(expected);
  });

  it.each([
    "TOTAL",
    "Total",
    "SUBTOTAL",
    "Grand Total",
    "CASH",
    "cash",
    "Cash:",
    "Cash ($)",
    "NET LIQUIDATION",
    "Net Liquidation Value",
    "BALANCE",
    "Portfolio",
  ])("treats %j as a noise row", (raw) => {
    expect(normalizeTicker(raw)).toBeNull();
  });

  it.each(["BP.L", "0700.HK", "", "   ", "Apple Inc", "TOOLONGTICKER"])(
    "rejects %j",
    (raw) => {
      expect(normalizeTicker(raw)).toBeNull();
    },
  );

  it("does not throw on non-string input", () => {
    expect(normalizeTicker(undefined as unknown as string)).toBeNull();
    expect(normalizeTicker(42 as unknown as string)).toBeNull();
  });
});

describe("parseNumber", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["1 234,56", 1234.56],
    ["1 234,56", 1234.56],
    ["(250)", -250],
    ["(1,234.5)", -1234.5],
    ["$1,000", 1000],
    ["€ 2.500,00", 2500],
    ["USD 10", 10],
    ["12%", 12],
    ["1,5", 1.5],
    ["0,25", 0.25],
    ["1,234", 1234],
    ["12,345,678", 12345678],
    ["1.234.567", 1234567],
    ["1.5", 1.5],
    ["-5", -5],
    ["5-", -5],
    ["  42  ", 42],
  ])("parses %j as %d", (raw, expected) => {
    expect(parseNumber(raw)).toBe(expected);
  });

  it("passes finite numbers through", () => {
    expect(parseNumber(3.5)).toBe(3.5);
    expect(parseNumber(0)).toBe(0);
  });

  it.each(["n/a", "", "—", "-", "abc", NaN, Infinity, -Infinity, "NaN", "Infinity", null, undefined, {}, true])(
    "returns null for %j",
    (raw) => {
      expect(parseNumber(raw)).toBeNull();
    },
  );
});

describe("guessColumns", () => {
  it("maps Avg price to perShare and the other fields", () => {
    const m = guessColumns(["Ticker", "Shares", "Avg price", "Account", "Open date"]);
    expect(m).toMatchObject({
      ticker: 0,
      shares: 1,
      cost: 2,
      costKind: "perShare",
      account: 3,
      date: 4,
    });
  });

  it("maps Cost and Total cost to total", () => {
    expect(guessColumns(["Symbol", "Qty", "Cost"])).toMatchObject({ cost: 2, costKind: "total" });
    expect(guessColumns(["Symbol", "Qty", "Total cost"])).toMatchObject({ cost: 2, costKind: "total" });
    expect(guessColumns(["Symbol", "Qty", "Cost basis"])).toMatchObject({ costKind: "total" });
  });

  it("recognises per-share synonyms", () => {
    expect(guessColumns(["Symbol", "Qty", "Price paid"]).costKind).toBe("perShare");
    expect(guessColumns(["Symbol", "Qty", "Average Cost"]).costKind).toBe("perShare");
    expect(guessColumns(["Symbol", "Qty", "Cost per share"]).costKind).toBe("perShare");
  });

  it("leaves cost undefined when there is no cost column", () => {
    const m = guessColumns(["Ticker", "Shares"]);
    expect(m.cost).toBeUndefined();
    expect(m.costKind).toBeUndefined();
  });

  it("ignores case, punctuation and whitespace", () => {
    expect(guessColumns(["  TICKER. ", "# Shares:"])).toMatchObject({ ticker: 0, shares: 1 });
  });

  it("never maps one column to two fields", () => {
    const m = guessColumns(["Symbol", "Position", "Cost"]);
    expect(m.shares).toBe(1);
    const used = [m.ticker, m.shares, m.cost, m.account, m.date].filter((x) => x !== undefined);
    expect(new Set(used).size).toBe(used.length);
  });

  it("does not throw on non-string headers", () => {
    expect(() => guessColumns([undefined, null, 5] as unknown as string[])).not.toThrow();
  });
});

describe("findHeaderRow", () => {
  it("finds the header after title and blank rows", () => {
    const rows = [
      ["My Portfolio"],
      ["Generated today"],
      [],
      ["Symbol", "Qty", "Cost"],
      ["AAPL", 1, 2],
    ];
    expect(findHeaderRow(rows)).toBe(3);
  });

  it("copes with merged-cell style rows of empty strings", () => {
    const rows = [
      ["Report", "", "", ""],
      ["", "", "", ""],
      ["", "Ticker", "", "Shares"],
    ];
    expect(findHeaderRow(rows)).toBe(2);
  });

  it("returns -1 when no header exists", () => {
    expect(findHeaderRow([["a", "b"], ["c", "d"]])).toBe(-1);
    expect(findHeaderRow([])).toBe(-1);
  });

  it("only scans the first 15 rows", () => {
    const rows: unknown[][] = Array.from({ length: 15 }, () => ["x"]);
    rows.push(["Ticker", "Shares"]);
    expect(findHeaderRow(rows)).toBe(-1);
  });

  it("guessColumns reports the header row", () => {
    expect(guessColumns(["Ticker", "Shares"]).headerRow).toBe(0);
  });
});

describe("parseSheet", () => {
  const map = {
    headerRow: 0,
    ticker: 0,
    shares: 1,
    cost: 2,
    costKind: "perShare" as const,
    account: 3,
    date: 4,
  };

  it("parses holdings", () => {
    const { holdings, warnings } = parseSheet(
      [
        ["Ticker", "Shares", "Avg", "Acct", "Date"],
        ["aapl", "10", "12,5", " Main ", "2023-01-15"],
        ["BRK.B", 2.5, 100, "", ""],
      ],
      map,
    );
    expect(warnings).toEqual([]);
    expect(holdings).toEqual([
      { ticker: "AAPL", shares: 10, cost: 12.5, costKind: "perShare", account: "Main", openDate: "2023-01-15" },
      { ticker: "BRK-B", shares: 2.5, cost: 100, costKind: "perShare", account: undefined, openDate: undefined },
    ]);
  });

  it("silently skips TOTAL and Cash rows and blank rows", () => {
    const { holdings, warnings } = parseSheet(
      [["T", "S"], ["AAPL", 1], ["TOTAL", 1], ["Cash", 5], ["", ""], []],
      { headerRow: 0, ticker: 0, shares: 1 },
    );
    expect(holdings.map((h) => h.ticker)).toEqual(["AAPL"]);
    expect(warnings).toEqual([]);
  });

  it("drops zero and negative shares with a warning using 1-based row numbers", () => {
    const { holdings, warnings } = parseSheet(
      [["x"], ["T", "S"], ["AAPL", 0], ["MSFT", -3], ["NVDA", 4], ["KO", "n/a"]],
      { headerRow: 1, ticker: 0, shares: 1 },
    );
    expect(holdings.map((h) => h.ticker)).toEqual(["NVDA"]);
    expect(warnings).toEqual([
      "Row 3: shares must be positive",
      "Row 4: shares must be positive",
      "Row 6: shares must be positive",
    ]);
  });

  it("warns about unreadable tickers", () => {
    const { holdings, warnings } = parseSheet(
      [["T", "S"], ["Apple Inc", 1]],
      { headerRow: 0, ticker: 0, shares: 1 },
    );
    expect(holdings).toEqual([]);
    expect(warnings).toEqual(['Row 2: could not read a ticker from "Apple Inc"']);
  });

  it("drops negative cost with a warning", () => {
    const { holdings, warnings } = parseSheet(
      [["T", "S", "C"], ["AAPL", 1, "(5)"]],
      { headerRow: 0, ticker: 0, shares: 1, cost: 2, costKind: "total" },
    );
    expect(holdings[0].cost).toBeUndefined();
    expect(warnings).toEqual(["Row 2: cost must not be negative"]);
  });

  it("returns a warning for an empty sheet", () => {
    expect(parseSheet([], { headerRow: 0, ticker: 0, shares: 1 })).toEqual({
      holdings: [],
      warnings: ["No holdings found"],
    });
    expect(parseSheet([["T", "S"]], { headerRow: 0, ticker: 0, shares: 1 })).toEqual({
      holdings: [],
      warnings: ["No holdings found"],
    });
  });

  it("explains a missing ticker or shares column", () => {
    const a = parseSheet([["x"], ["AAPL"]], { headerRow: 0, shares: 1 });
    expect(a.holdings).toEqual([]);
    expect(a.warnings[0]).toMatch(/ticker column/i);
    const b = parseSheet([["x"], ["AAPL"]], { headerRow: 0, ticker: 0 });
    expect(b.holdings).toEqual([]);
    expect(b.warnings[0]).toMatch(/shares column/i);
  });

  it("converts dates: serials, Date objects, M/D/YYYY, D/M/YYYY", () => {
    const rows = [
      ["T", "S", "D"],
      ["A", 1, 45000],
      ["B", 1, new Date(Date.UTC(2023, 4, 6))],
      ["C", 1, "3/14/2022"],
      ["D", 1, "25/12/2021"],
      ["E", 1, "garbage"],
      ["F", 1, "2020-02-03T10:00:00Z"],
    ];
    const { holdings } = parseSheet(rows, { headerRow: 0, ticker: 0, shares: 1, date: 2 });
    expect(holdings.map((h) => h.openDate)).toEqual([
      "2023-03-15",
      "2023-05-06",
      "2022-03-14",
      "2021-12-25",
      undefined,
      "2020-02-03",
    ]);
  });
});

describe("mergeDuplicates", () => {
  it("sums shares of identical lots and totals per-share costs", () => {
    const input: Holding[] = [
      { ticker: "AAPL", shares: 10, cost: 10, costKind: "perShare" },
      { ticker: "MSFT", shares: 1 },
      { ticker: "AAPL", shares: 30, cost: 20, costKind: "perShare" },
    ];
    const snapshot = structuredClone(input);
    const out = mergeDuplicates(input);
    expect(out).toEqual([
      { ticker: "AAPL", shares: 40, cost: 700, costKind: "total" },
      { ticker: "MSFT", shares: 1 },
    ]);
    expect(input).toEqual(snapshot);
  });

  it("sums total costs", () => {
    const out = mergeDuplicates([
      { ticker: "A", shares: 1, cost: 5, costKind: "total" },
      { ticker: "A", shares: 2, cost: 7, costKind: "total" },
    ]);
    expect(out).toEqual([{ ticker: "A", shares: 3, cost: 12, costKind: "total" }]);
  });

  it("keeps lots separate when only one has a cost", () => {
    const out = mergeDuplicates([
      { ticker: "A", shares: 1, cost: 5, costKind: "total" },
      { ticker: "A", shares: 2 },
    ]);
    expect(out).toHaveLength(2);
  });

  it("does not merge across accounts or dates", () => {
    const out = mergeDuplicates([
      { ticker: "A", shares: 1, account: "x" },
      { ticker: "A", shares: 1, account: "y" },
      { ticker: "A", shares: 1, openDate: "2020-01-01" },
      { ticker: "A", shares: 1 },
      { ticker: "A", shares: 1 },
    ]);
    expect(out.map((h) => h.shares)).toEqual([1, 1, 1, 2]);
  });
});

describe("detectColumns", () => {
  it("combines header detection and column mapping", async () => {
    const { detectColumns } = await import("./normalize");
    const rows = [["Title"], [], ["Ticker", "Shares", "Cost"], ["AAPL", 1, 2]];
    expect(detectColumns(rows)).toMatchObject({ headerRow: 2, ticker: 0, shares: 1, cost: 2 });
    expect(detectColumns([["a"]])).toBeNull();
  });
});
