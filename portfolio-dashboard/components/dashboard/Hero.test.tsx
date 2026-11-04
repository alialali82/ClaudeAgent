// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dashboard } from "@/lib/dashboard/build";
import { sampleDashboard } from "@/lib/testing/sampleDashboard";
import { Hero } from "./Hero";

const base = sampleDashboard();
const scen = (key: "hc" | "cons", value: number, ret: number) => ({
  ...base.scenarios.find((s) => s.key === key)!,
  value,
  ret,
});

/** Mixed-cost dashboard: one account fully costed, one with no cost at all. */
const mixed: Dashboard = {
  ...base,
  asof: "2026-10-07",
  prevAsof: "2026-10-06",
  total: 120000,
  prev: 118800,
  cost: 100000,
  costedValue: 110000,
  ret: 0.1,
  accounts: [
    { name: "Brokerage", value: 80000, cost: 100000, costedValue: 75000, ret: -0.25 },
    { name: "Retirement", value: 40000, cost: null, costedValue: 0, ret: null },
  ],
  scenarios: [scen("cons", 150000, 0.25), scen("hc", 138000, 0.15)],
};

/** Visible text with a space at every element boundary, whitespace collapsed. */
const flat = (n: Node): string =>
  n.nodeType === Node.TEXT_NODE ? (n.textContent ?? "") : ` ${[...n.childNodes].map(flat).join("")} `;
const text = (el: Element | null) => (el ? flat(el).replace(/\s+/g, " ").trim() : undefined);

function setDevice(y: number, m: number, d: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));
}
beforeEach(() => setDevice(2026, 10, 8));
afterEach(() => vi.useRealTimers());

describe("Hero", () => {
  it("shows the total and the stamp line", () => {
    const { container } = render(<Hero dashboard={mixed} />);
    expect(text(container.querySelector("h1.big"))).toBe("$120,000");
    expect(text(container.querySelector(".stamp"))).toBe("Prices 7 Oct close 9 positions 2 accounts USD");
  });

  it("uses singular wording and hides the account count for one account", () => {
    const d = { ...mixed, positions: mixed.positions.slice(0, 1), accounts: mixed.accounts.slice(0, 1) };
    const { container } = render(<Hero dashboard={d} />);
    expect(text(container.querySelector(".stamp"))).toBe("Prices 7 Oct close 1 position USD");
  });

  it("shows the day change with sign, percentage and the previous date", () => {
    const { container } = render(<Hero dashboard={mixed} />);
    const pill = container.querySelector(".deltas .pill") as HTMLElement;
    expect(text(pill)).toBe("+$1,200 · +1.01% since 6 Oct");
    expect(pill).toHaveClass("gain");
  });

  it("marks a falling day as a loss", () => {
    const { container } = render(<Hero dashboard={{ ...mixed, prev: 121200 }} />);
    const pill = container.querySelector(".deltas .pill") as HTMLElement;
    expect(text(pill)).toBe("−$1,200 · −0.99% since 6 Oct");
    expect(pill).toHaveClass("loss");
  });

  it("hides the day change when there is no previous value", () => {
    const { container } = render(<Hero dashboard={{ ...mixed, prev: 0 }} />);
    expect(container.querySelector(".deltas .pill")).toBeNull();
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("uses the server return over costed lots for unrealised gain", () => {
    const { container } = render(<Hero dashboard={mixed} />);
    const un = container.querySelector(".deltas > span:not(.pill)") as HTMLElement;
    expect(text(un)).toBe("+$10,000 unrealised · +10.0%");
    expect(un).toHaveClass("gain");
  });

  it("asks for cost when returns are unknown", () => {
    for (const d of [
      { ...mixed, cost: null, ret: null },
      { ...mixed, ret: null },
    ]) {
      const { container, unmount } = render(<Hero dashboard={d} />);
      expect(container.querySelector(".deltas")).toHaveTextContent("Add cost to see returns");
      expect(container.querySelector(".deltas")).not.toHaveTextContent("unrealised");
      unmount();
    }
  });

  it("shows the key figures", () => {
    const { container } = render(<Hero dashboard={mixed} />);
    const tiles = [...container.querySelectorAll(".kv > div")].map((t) => text(t));
    expect(tiles).toEqual([
      "Invested $100,000",
      `Largest holding ${base.positions[0].ticker} ${(base.positions[0].w * 100).toFixed(1)}%`,
      "At Street average $150,000 +25.0%",
      "At haircut target $138,000 +15.0%",
    ]);
  });

  it("shows a dash for invested when no lot has a cost", () => {
    const { container } = render(<Hero dashboard={{ ...mixed, cost: null, ret: null }} />);
    expect(text(container.querySelector(".kv > div"))).toBe("Invested —");
  });

  it("splits by account using each account's own return, never value over cost", () => {
    const { container } = render(<Hero dashboard={mixed} />);
    const key = container.querySelector(".splitkey") as HTMLElement;
    // Brokerage ret is -25% on the server even though value/cost would suggest -20%.
    expect(text(key)).toBe("Brokerage $80,000 · −25.0% Retirement $40,000");
    const bar = container.querySelector(".split") as HTMLElement;
    expect(bar).toHaveAttribute("aria-label", "Brokerage 67%, Retirement 33%");
    expect(bar.querySelectorAll("i")).toHaveLength(2);
    expect((bar.querySelector("i") as HTMLElement).style.background).toContain("--acc0");
  });

  it("omits the account split for a single account", () => {
    const d = { ...mixed, accounts: mixed.accounts.slice(0, 1) };
    const { container } = render(<Hero dashboard={d} />);
    expect(container.querySelector(".split")).toBeNull();
  });
});

describe("Hero stale-price pill", () => {
  it("is absent when the latest close is current", () => {
    const { container } = render(<Hero dashboard={mixed} />);
    expect(container.querySelector(".stamp .pill")).toBeNull();
  });

  it("counts trading days on the device date, skipping weekends", () => {
    setDevice(2026, 10, 12);
    const { container } = render(<Hero dashboard={mixed} />);
    expect(text(container.querySelector(".stamp .pill"))).toBe("Prices are 2 trading days behind");
  });

  it("uses the singular for one day", () => {
    setDevice(2026, 10, 9);
    const { container } = render(<Hero dashboard={mixed} />);
    expect(text(container.querySelector(".stamp .pill"))).toBe("Prices are 1 trading day behind");
  });
});
