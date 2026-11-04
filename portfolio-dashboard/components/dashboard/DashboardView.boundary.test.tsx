// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleDashboard } from "@/lib/testing/sampleDashboard";
import { DashboardView } from "./DashboardView";

vi.mock("./Treemap", () => ({
  Treemap: () => {
    throw new Error("treemap exploded");
  },
}));

describe("DashboardView error containment", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("a throwing section shows its own failure and the rest still render", () => {
    const d = sampleDashboard();
    const { container } = render(<DashboardView dashboard={d} />);
    expect(screen.getAllByText("This section failed to draw.")).toHaveLength(1);
    expect(container.querySelector("#map-sec .fail")).not.toBeNull();
    expect(container.querySelector("header.hero")).not.toBeNull();
    expect(container.querySelectorAll("#map-sec .flag")).toHaveLength(d.flags.length);
    expect(screen.getByRole("heading", { name: "Since 6 Oct close" })).toBeInTheDocument();
  });
});
