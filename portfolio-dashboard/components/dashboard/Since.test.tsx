// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Dashboard } from "@/lib/dashboard/build";
import { sampleDashboard } from "@/lib/testing/sampleDashboard";
import { Since } from "./Since";

const base = sampleDashboard();

/** The first n sample positions with chosen day moves in dollars. */
function withMoves(moves: number[], extra: Partial<Dashboard> = {}): Dashboard {
  const positions = moves.map((dayUsd, i) => ({
    ...base.positions[i],
    dayUsd,
    day: dayUsd / 10000,
  }));
  return { ...base, positions, ...extra };
}
const order = (c: HTMLElement) => [...c.querySelectorAll(".mv")].map((r) => r.firstElementChild?.textContent);
const T = base.positions.map((p) => p.ticker);

describe("Since", () => {
  it("headlines the previous close and the day's change", () => {
    const d = { ...base, total: 11000, prev: 10000 };
    render(<Since dashboard={d} />);
    expect(screen.getByRole("heading", { name: "Since 6 Oct close" })).toBeInTheDocument();
    expect(screen.getByText("+$1,000 (+10.00%)")).toHaveClass("gain");
  });

  it("omits the percentage when there is no previous value", () => {
    const { container } = render(<Since dashboard={{ ...base, prev: 0 }} />);
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("shows the top four and bottom four movers, biggest gain first", () => {
    const moves = [500, -300, 100, 900, -800, 50, -20, 300, 10];
    const { container } = render(<Since dashboard={withMoves(moves)} />);
    // top 4 by dayUsd: idx3 900, idx0 500, idx7 300, idx2 100
    // bottom 4, worst first: idx4 -800, idx1 -300, idx6 -20, idx8 10
    expect(order(container)).toEqual([T[3], T[0], T[7], T[2], T[4], T[1], T[6], T[8]]);
  });

  it("does not repeat a holding when there are few positions", () => {
    const { container } = render(<Since dashboard={withMoves([300, -100, 50])} />);
    expect(order(container)).toEqual([T[0], T[2], T[1]]);
  });

  it("colours bars by direction and sizes them against the biggest move", () => {
    const { container } = render(<Since dashboard={withMoves([400, -200])} />);
    const [up, down] = [...container.querySelectorAll(".mv .bar i")] as HTMLElement[];
    expect(up.style.width).toBe("50%");
    expect(down.style.width).toBe("25%");
    expect(up.style.background).toContain("--gain");
    expect(down.style.background).toContain("--loss");
    expect(container.querySelectorAll(".mv .v")[1]).toHaveClass("loss");
    expect(container.querySelectorAll(".mv .v")[1].textContent).toContain("−$200");
  });

  it("copes when nothing moved", () => {
    const { container } = render(<Since dashboard={withMoves([0, 0, 0])} />);
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
    expect((container.querySelector(".mv .bar i") as HTMLElement).style.width).toBe("0%");
  });

  it("lists what changed with linked tickers", () => {
    const d = {
      ...base,
      changes: [
        { key: "Target ≥5%", text: "NVDA Street average $300.00 → $330.00 (+10.0%)." },
        { key: "Next 14 days", text: "No results scheduled." },
      ],
    };
    const { container } = render(<Since dashboard={d} />);
    const rows = [...container.querySelectorAll(".changes li")];
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector(".t")?.textContent).toBe("Target ≥5%");
    expect(rows[0].querySelector("a.tkl")?.textContent).toBe("NVDA");
    expect(rows[1]).toHaveTextContent("No results scheduled.");
  });

  it("handles an empty change list", () => {
    const { container } = render(<Since dashboard={{ ...base, changes: [] }} />);
    expect(container.querySelectorAll(".changes li")).toHaveLength(0);
    expect(screen.getByText("No changes to report.")).toBeInTheDocument();
  });
});
