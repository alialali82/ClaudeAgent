// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dashboard, DashboardPosition } from "@/lib/dashboard/build";
import { sampleDashboard } from "@/lib/testing/sampleDashboard";
import { Treemap } from "./Treemap";

const base = sampleDashboard();

/** One-position dashboard whose single tile has the given price, Street low and upside. */
function one(over: {
  price?: number;
  low?: number | null;
  up?: number | null;
  lowc?: boolean;
  value?: number;
}): Dashboard {
  const p = base.positions[0];
  const pos: DashboardPosition = {
    ...p,
    value: over.value ?? 1000,
    w: 1,
    market: {
      ...p.market,
      price: over.price ?? 100,
      sp: over.low === null ? null : { avg: 120, low: over.low ?? 50, high: 200, n: 20 },
    },
    view: { ...p.view, up: over.up === undefined ? 0.2 : over.up, lowc: over.lowc ?? false },
  };
  return { ...base, positions: [pos] };
}

const tile = () => screen.getByRole("button");

afterEach(() => vi.restoreAllMocks());

describe("Treemap colour bins", () => {
  it.each([
    [-0.01, "t0"],
    [0, "t1"],
    [0.099, "t1"],
    [0.1, "t2"],
    [0.29, "t2"],
    [0.3, "t3"],
    [0.49, "t3"],
    [0.5, "t4"],
    [2, "t4"],
  ])("upside %s -> %s", (up, cls) => {
    render(<Treemap dashboard={one({ up })} />);
    expect(tile()).toHaveClass("tile", cls);
  });

  it("uses the cold tile when the price is below the lowest target, whatever the upside", () => {
    render(<Treemap dashboard={one({ price: 40, low: 50, up: 0.6 })} />);
    expect(tile()).toHaveClass("tc");
    expect(tile()).not.toHaveClass("t4");
  });

  it("does not treat a price equal to the low as below it", () => {
    render(<Treemap dashboard={one({ price: 50, low: 50, up: 0.2 })} />);
    expect(tile()).toHaveClass("t2");
  });

  it("uses the neutral tile and says 'no target' without a Street target", () => {
    render(<Treemap dashboard={one({ low: null, up: null })} />);
    expect(tile()).toHaveClass("tn");
    expect(tile()).toHaveTextContent("no target");
    expect(tile().getAttribute("aria-label")).toMatch(/no Street target/);
    expect(tile().textContent).not.toMatch(/NaN|null|undefined/);
  });

  it("hatches low-confidence tiles", () => {
    render(<Treemap dashboard={one({ lowc: true })} />);
    expect(tile()).toHaveClass("lowc");
  });

  it("does not hatch confident tiles", () => {
    render(<Treemap dashboard={one({ lowc: false })} />);
    expect(tile()).not.toHaveClass("lowc");
  });
});

describe("Treemap tiles", () => {
  it("renders ticker, weight and upside with an aria-label like the reference", () => {
    render(<Treemap dashboard={one({ up: 0.2 })} />);
    const p = base.positions[0];
    expect(tile()).toHaveTextContent(p.ticker);
    expect(tile()).toHaveTextContent("100.0%");
    expect(tile()).toHaveTextContent("Street +20%");
    expect(tile()).toHaveAttribute("aria-label", `${p.name}, 100.0% of portfolio, Street average +20.0%`);
  });

  it("draws one tile per position, largest first", () => {
    render(<Treemap dashboard={base} />);
    const tiles = screen.getAllByRole("button");
    expect(tiles).toHaveLength(base.positions.length);
    const byValue = [...base.positions].sort((a, b) => b.value - a.value).map((p) => p.ticker);
    expect(tiles.map((t) => t.querySelector(".tk")?.textContent)).toEqual(byValue);
  });

  it("scrolls to the holding card and announces dash:open on click", () => {
    const target = document.createElement("div");
    target.id = `t-${base.positions[0].ticker}`;
    target.scrollIntoView = vi.fn();
    document.body.append(target);
    const heard: string[] = [];
    const on = (e: Event) => heard.push((e as CustomEvent<string>).detail);
    window.addEventListener("dash:open", on);
    render(<Treemap dashboard={one({})} />);
    fireEvent.click(tile());
    window.removeEventListener("dash:open", on);
    target.remove();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(heard).toEqual([base.positions[0].ticker]);
  });

  it("still announces dash:open when the card is not on the page yet", () => {
    const on = vi.fn();
    window.addEventListener("dash:open", on);
    render(<Treemap dashboard={one({})} />);
    fireEvent.click(tile());
    window.removeEventListener("dash:open", on);
    expect(on).toHaveBeenCalledTimes(1);
  });

  it("renders the legend, including the no-target swatch only when needed", () => {
    const { container, rerender } = render(<Treemap dashboard={one({})} />);
    expect(screen.getByText("Below lowest target")).toBeInTheDocument();
    expect(screen.getByText("Low-confidence target")).toBeInTheDocument();
    expect(container.querySelector(".maplegend")).not.toHaveTextContent("No Street target");
    rerender(<Treemap dashboard={one({ low: null, up: null })} />);
    expect(container.querySelector(".maplegend")).toHaveTextContent("No Street target");
  });

  it("copes with 100 positions and zero-weight holdings", () => {
    const p = base.positions[0];
    const many = Array.from({ length: 100 }, (_, i) => ({
      ...p,
      ticker: `T${i}`,
      value: i === 0 ? 0 : 1000 - i,
      w: i === 0 ? 0 : (1000 - i) / 90000,
    }));
    const { container } = render(<Treemap dashboard={{ ...base, positions: many }} />);
    expect(screen.getAllByRole("button")).toHaveLength(99);
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("renders nothing breakable for an empty portfolio", () => {
    const { container } = render(<Treemap dashboard={{ ...base, positions: [] }} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("re-lays out after the container is resized (debounced)", () => {
    vi.useFakeTimers();
    let cb: ResizeObserverCallback = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(c: ResizeObserverCallback) {
          cb = c;
        }
        observe() {}
        disconnect() {}
      },
    );
    const { container } = render(<Treemap dashboard={base} />);
    const map = container.querySelector(".map") as HTMLElement;
    const layout = () => screen.getAllByRole("button").map((t) => t.style.cssText);
    cb([], {} as ResizeObserver); // the observer's initial notification
    const before = layout();
    Object.defineProperty(map, "clientWidth", { configurable: true, value: 300 });
    Object.defineProperty(map, "clientHeight", { configurable: true, value: 360 });
    act(() => cb([], {} as ResizeObserver));
    act(() => vi.advanceTimersByTime(149));
    expect(layout()).toEqual(before);
    act(() => vi.advanceTimersByTime(2));
    expect(layout()).not.toEqual(before);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
