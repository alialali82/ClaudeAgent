// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionBoundary } from "./SectionBoundary";

function Boom(): never {
  throw new Error("kaboom");
}

describe("SectionBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders its children when nothing throws", () => {
    render(
      <SectionBoundary>
        <p>fine</p>
      </SectionBoundary>,
    );
    expect(screen.getByText("fine")).toBeInTheDocument();
    expect(screen.queryByText(/failed to draw/)).not.toBeInTheDocument();
  });

  it("shows a contained failure message and leaves siblings alone", () => {
    render(
      <div>
        <SectionBoundary>
          <Boom />
        </SectionBoundary>
        <SectionBoundary>
          <p>sibling</p>
        </SectionBoundary>
      </div>,
    );
    expect(screen.getAllByText("This section failed to draw.")).toHaveLength(1);
    expect(screen.getByText("sibling")).toBeInTheDocument();
  });
});
