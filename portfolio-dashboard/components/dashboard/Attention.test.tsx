// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Dashboard } from "@/lib/dashboard/build";
import { sampleDashboard } from "@/lib/testing/sampleDashboard";
import { Attention } from "./Attention";

const base = sampleDashboard();
const withFlags = (flags: Dashboard["flags"]): Dashboard => ({ ...base, flags });

describe("Attention", () => {
  it("renders nothing when there are no flags", () => {
    const { container } = render(<Attention dashboard={withFlags([])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each flag with its tone class and label", () => {
    const { container } = render(
      <Attention
        dashboard={withFlags([
          { tone: "hot", key: "Results", text: "NVDA reports tomorrow." },
          { tone: "cold", key: "Below every target", text: "MRAM trades low." },
          { tone: "info", key: "Concentration", text: "NVDA is big." },
        ])}
      />,
    );
    const rows = [...container.querySelectorAll(".flag")];
    expect(rows.map((r) => r.className)).toEqual(["flag hot", "flag cold", "flag info"]);
    expect(rows.map((r) => r.querySelector(".k")?.textContent)).toEqual([
      "Results",
      "Below every target",
      "Concentration",
    ]);
  });

  it("links held tickers and nothing else", () => {
    const { container } = render(
      <Attention dashboard={withFlags([{ tone: "info", key: "k", text: "NVDA, MU and AAPL; KNOWN NOW." }])} />,
    );
    const linked = [...container.querySelectorAll("a.tkl")].map((a) => a.textContent);
    // NOW is held in the sample; AAPL is not; KNOWN must not be split.
    expect(linked).toEqual(["NVDA", "MU", "NOW"]);
  });

  it("shows markup in a flag as text", () => {
    const evil = "<img src=x onerror=alert(1)> NVDA";
    const { container } = render(<Attention dashboard={withFlags([{ tone: "hot", key: "k", text: evil }])} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".flag p")?.textContent).toBe(evil);
  });

  it("opens the holding when a ticker link is clicked", () => {
    const on = vi.fn();
    document.addEventListener("dash:open", on);
    render(<Attention dashboard={withFlags([{ tone: "hot", key: "Results", text: "NVDA reports tomorrow." }])} />);
    fireEvent.click(screen.getByRole("link", { name: "NVDA" }));
    document.removeEventListener("dash:open", on);
    expect((on.mock.calls[0][0] as CustomEvent<string>).detail).toBe("NVDA");
  });

  it("renders the real flags of the sample dashboard", () => {
    const { container } = render(<Attention dashboard={base} />);
    expect(container.querySelectorAll(".flag").length).toBe(base.flags.length);
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });
});
