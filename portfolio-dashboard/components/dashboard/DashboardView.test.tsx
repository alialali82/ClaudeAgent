// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { degradedDashboard, emptyDashboard, sampleDashboard } from "@/lib/testing/sampleDashboard";
import { DashboardView } from "./DashboardView";

const BAD = /\b(NaN|undefined|Infinity)\b/;

describe("DashboardView status area", () => {
  it("shows no banners for a clean dashboard", () => {
    const { container } = render(<DashboardView dashboard={sampleDashboard()} />);
    expect(container.querySelector(".status")).toBeNull();
  });

  it("maps failure codes to plain reasons", () => {
    render(<DashboardView dashboard={degradedDashboard()} />);
    const banner = screen.getByText(/Couldn't load market data for:/).closest(".banner") as HTMLElement;
    expect(banner).toHaveTextContent(
      "Couldn't load market data for: BADQ (no price available), NOPE (ticker not found), SLOW (timed out)",
    );
  });

  it("falls back to 'lookup failed' for unknown codes", () => {
    const d = { ...degradedDashboard(), failures: [{ ticker: "X1", code: "failed" }, { ticker: "X2", code: "weird" }] };
    render(<DashboardView dashboard={d} />);
    expect(screen.getByText(/Couldn't load market data for:/)).toHaveTextContent(
      "X1 (lookup failed), X2 (lookup failed)",
    );
  });

  it("lists unpriced tickers that are not already failures", () => {
    render(<DashboardView dashboard={degradedDashboard()} />);
    const banner = screen.getByText(/Excluded from totals/).closest(".banner") as HTMLElement;
    // SLOW and NOPE are failures and are reported there; only NOPR is extra.
    expect(banner).toHaveTextContent("Excluded from totals (no price): NOPR");
    expect(banner).not.toHaveTextContent("SLOW");
  });

  it("omits the unpriced banner when every unpriced ticker is a failure", () => {
    const d = { ...degradedDashboard(), unpriced: ["SLOW"] };
    render(<DashboardView dashboard={d} />);
    expect(screen.queryByText(/Excluded from totals/)).not.toBeInTheDocument();
  });

  it("collapses source notes in plain words", () => {
    const { container } = render(<DashboardView dashboard={degradedDashboard()} />);
    const details = container.querySelector("details.banner") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText("Some data was unavailable for 3 holdings")).toBeInTheDocument();
    expect(details).toHaveTextContent("AEM: beta, results dates");
    expect(details).toHaveTextContent("MRAM: Zacks target, Street targets");
    expect(details).toHaveTextContent("VRA: Street targets");
    expect(details.textContent).not.toMatch(/stockanalysis|nasdaq_/);
  });

  it("uses the singular for one holding", () => {
    const d = { ...degradedDashboard(), sourceNotes: [{ ticker: "AEM", missing: ["yahoo", "nasdaq_profile"] }] };
    render(<DashboardView dashboard={d} />);
    expect(screen.getByText("Some data was unavailable for 1 holding")).toBeInTheDocument();
    expect(screen.getByText(/AEM: prices, sector/)).toBeInTheDocument();
  });
});

describe("DashboardView empty state", () => {
  it("explains that nothing could be priced and keeps the failure banner", () => {
    const { container } = render(<DashboardView dashboard={emptyDashboard()} />);
    expect(screen.getByRole("heading", { name: "No holdings could be priced" })).toBeInTheDocument();
    expect(screen.getByText(/Start over/)).toBeInTheDocument();
    expect(screen.getByText(/Couldn't load market data for:/)).toHaveTextContent("ZZZZ (ticker not found)");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(BAD);
  });
});

describe("DashboardView text hygiene", () => {
  it.each([
    ["sample", sampleDashboard],
    ["empty", emptyDashboard],
    ["degraded", degradedDashboard],
  ])("never prints NaN, undefined or Infinity (%s)", (_n, make) => {
    const { container } = render(<DashboardView dashboard={make()} />);
    expect(container.textContent).not.toMatch(BAD);
  });
});

describe("DashboardView map section", () => {
  it("draws The map with one tile per position", () => {
    const d = sampleDashboard();
    render(<DashboardView dashboard={d} />);
    expect(screen.getByRole("heading", { name: "The map" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(d.positions.length);
  });
});

describe("DashboardView hero", () => {
  it("opens with the portfolio value", () => {
    const d = sampleDashboard();
    render(<DashboardView dashboard={d} />);
    expect(screen.getByRole("heading", { level: 1, name: "Portfolio value" })).toHaveTextContent(/^\$[\d,]+$/);
  });
});

describe("DashboardView 14a sections", () => {
  it("renders hero, map, attention and since for the sample dashboard", () => {
    const d = sampleDashboard();
    const { container } = render(<DashboardView dashboard={d} />);
    expect(container.querySelector("header.hero")).not.toBeNull();
    expect(container.querySelector("#map-sec .map")).not.toBeNull();
    expect(container.querySelectorAll("#map-sec .flag")).toHaveLength(d.flags.length);
    expect(screen.getByRole("heading", { name: "Since 6 Oct close" })).toBeInTheDocument();
    expect(container.querySelector(".fail")).toBeNull();
  });

  it("shows the degraded dashboard's no-target tiles as neutral", () => {
    const { container } = render(<DashboardView dashboard={degradedDashboard()} />);
    expect(container.querySelectorAll(".tile.tn").length).toBeGreaterThan(0);
    expect(container.querySelector(".fail")).toBeNull();
  });
});
