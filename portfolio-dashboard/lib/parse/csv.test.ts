import { describe, expect, it } from "vitest";
import { parseCsvText } from "./csv";

describe("parseCsvText", () => {
  it("parses comma separated text and skips empty lines", () => {
    expect(parseCsvText("Ticker,Shares\nAAPL,10\n\n,,\nMSFT,5\n")).toEqual([
      ["Ticker", "Shares"],
      ["AAPL", "10"],
      ["MSFT", "5"],
    ]);
  });

  it("auto-detects the semicolon delimiter", () => {
    expect(parseCsvText("Ticker;Shares;Cost\nAAPL;10;1,5\n")).toEqual([
      ["Ticker", "Shares", "Cost"],
      ["AAPL", "10", "1,5"],
    ]);
  });

  it("auto-detects tabs", () => {
    expect(parseCsvText("Ticker\tShares\nAAPL\t10\n")).toEqual([
      ["Ticker", "Shares"],
      ["AAPL", "10"],
    ]);
  });

  it("handles quoted fields and a BOM", () => {
    expect(parseCsvText('﻿Ticker,Cost\n"BRK.B","1,234.50"\n')).toEqual([
      ["Ticker", "Cost"],
      ["BRK.B", "1,234.50"],
    ]);
  });

  it("returns no rows for empty text", () => {
    expect(parseCsvText("")).toEqual([]);
  });
});
