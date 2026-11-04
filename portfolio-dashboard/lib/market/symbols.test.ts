import { describe, expect, it } from "vitest";
import { toSourceSymbol } from "./symbols";

describe("toSourceSymbol", () => {
  it("leaves plain tickers unchanged per source (uppercase, except stockanalysis path lowercase)", () => {
    expect(toSourceSymbol("NVDA", "yahoo")).toBe("NVDA");
    expect(toSourceSymbol("NVDA", "nasdaq")).toBe("NVDA");
    expect(toSourceSymbol("NVDA", "stockanalysis")).toBe("nvda");
  });
  it("maps class shares BRK-B per source", () => {
    expect(toSourceSymbol("BRK-B", "yahoo")).toBe("BRK-B");
    expect(toSourceSymbol("BRK-B", "stockanalysis")).toBe("brk.b");
    expect(toSourceSymbol("BRK-B", "nasdaq")).toBe("BRK.B");
  });
  it("normalises case and whitespace, and dot input", () => {
    expect(toSourceSymbol(" brk-b ", "yahoo")).toBe("BRK-B");
    expect(toSourceSymbol("brk.b", "yahoo")).toBe("BRK-B");
    expect(toSourceSymbol("nvda", "nasdaq")).toBe("NVDA");
  });
});
