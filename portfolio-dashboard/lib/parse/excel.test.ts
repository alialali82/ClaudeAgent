import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readFileRows } from "./excel";
import { detectColumns, mergeDuplicates, parseSheet } from "./normalize";

const fixture = (name: string) =>
  new File([readFileSync(join(__dirname, "__fixtures__", name))], name);

describe("readFileRows", () => {
  it("reads a clean xlsx and keeps Date cells", async () => {
    const { sheets } = await readFileRows(fixture("clean.xlsx"));
    expect(sheets).toHaveLength(1);
    expect(sheets[0].rows[0]).toEqual(["Ticker", "Shares", "Avg price", "Account", "Open date"]);
    expect(sheets[0].rows[1][4]).toBeInstanceOf(Date);
    const map = detectColumns(sheets[0].rows)!;
    expect(map.costKind).toBe("perShare");
    const { holdings, warnings } = parseSheet(sheets[0].rows, map);
    expect(warnings).toEqual([]);
    expect(holdings).toEqual([
      { ticker: "AAAA", shares: 10, cost: 12.5, costKind: "perShare", account: "Brokerage A", openDate: "2023-01-15" },
      { ticker: "BBBB", shares: 5.5, cost: 100, costKind: "perShare", account: "Brokerage A", openDate: "2022-06-01" },
      { ticker: "CCCC", shares: 200, cost: 3.25, costKind: "perShare", account: "Retirement", openDate: "2021-11-30" },
    ]);
  });

  it("parses a messy sheet: title rows, European decimals, TOTAL and Cash rows", async () => {
    const { sheets } = await readFileRows(fixture("messy.xlsx"));
    const map = detectColumns(sheets[0].rows)!;
    expect(map.headerRow).toBe(3);
    expect(map.costKind).toBe("total");
    const { holdings, warnings } = parseSheet(sheets[0].rows, map);
    expect(warnings).toEqual(["Row 7: cost must not be negative"]);
    expect(holdings).toEqual([
      { ticker: "AAAA", shares: 10, cost: 1234.5, costKind: "total", account: "Main", openDate: "2023-03-02" },
      { ticker: "BRK-B", shares: 3, cost: 900.25, costKind: "total", account: "Main", openDate: "2022-08-19" },
      { ticker: "DDDD", shares: 1.5, account: "Main", openDate: "2020-01-01" },
      ]);
  });

  it("reads every sheet of a workbook", async () => {
    const { sheets } = await readFileRows(fixture("two-sheets.xlsx"));
    expect(sheets.map((s) => s.name)).toEqual(["Taxable", "IRA"]);
    const all = sheets.flatMap((s) => parseSheet(s.rows, detectColumns(s.rows)!).holdings);
    expect(mergeDuplicates(all).map((h) => h.ticker)).toEqual(["AAAA", "BBBB", "CCCC"]);
  });

  it("reads csv into a single sheet and detects the delimiter", async () => {
    const file = new File(["Ticker;Shares\nAAPL;3\n"], "p.csv", { type: "text/csv" });
    const { sheets } = await readFileRows(file);
    expect(sheets).toEqual([{ name: "CSV", rows: [["Ticker", "Shares"], ["AAPL", "3"]] }]);
  });

  it("rejects .xls", async () => {
    await expect(readFileRows(new File(["x"], "old.xls"))).rejects.toThrow("Save as .xlsx");
  });

  it("rejects unsupported types", async () => {
    await expect(readFileRows(new File(["x"], "a.pdf"))).rejects.toThrow("Unsupported file type");
  });

  it("rejects files over 5 MB", async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.csv");
    await expect(readFileRows(big)).rejects.toThrow("File too large (max 5 MB)");
  });

  it("reports a friendly error for a corrupt xlsx", async () => {
    await expect(readFileRows(new File(["not a zip"], "bad.xlsx"))).rejects.toThrow(/could not read/i);
  });
});
