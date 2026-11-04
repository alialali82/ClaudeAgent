// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Linkified } from "./Linkified";

const links = (c: HTMLElement) => [...c.querySelectorAll("a.tkl")].map((a) => a.textContent);

describe("Linkified", () => {
  it("links whole-word tickers to their holding card", () => {
    const { container } = render(<Linkified text="NVDA and MU report soon." tickers={["NVDA", "MU"]} />);
    expect(links(container)).toEqual(["NVDA", "MU"]);
    const a = container.querySelector("a.tkl") as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("#t-NVDA");
    expect(a).toHaveAttribute("data-go", "NVDA");
    expect(container.textContent).toBe("NVDA and MU report soon.");
  });

  it("does not link a ticker inside a longer word", () => {
    const { container } = render(
      <Linkified text="KNOWN risks, NOWADAYS, SNOW and NOW." tickers={["NOW", "SNO"]} />,
    );
    expect(links(container)).toEqual(["NOW"]);
    expect(container.textContent).toBe("KNOWN risks, NOWADAYS, SNOW and NOW.");
  });

  it("prefers the longest ticker at a position", () => {
    const { container } = render(<Linkified text="BRK-B and BRK trade." tickers={["BRK", "BRK-B"]} />);
    expect(links(container)).toEqual(["BRK-B", "BRK"]);
  });

  it("only links tickers it was given and matches case-sensitively", () => {
    const { container } = render(<Linkified text="AAPL, now and NOW." tickers={["NOW"]} />);
    expect(links(container)).toEqual(["NOW"]);
  });

  it("escapes regex metacharacters in tickers", () => {
    const { container } = render(<Linkified text="Hold BF.B, not BFxB." tickers={["BF.B"]} />);
    expect(links(container)).toEqual(["BF.B"]);
  });

  it("renders markup in the text as plain text", () => {
    const evil = 'NVDA <img src=x onerror="alert(1)"> <script>alert(2)</script>';
    const { container } = render(<Linkified text={evil} tickers={["NVDA"]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toBe(evil);
  });

  it("returns the text untouched without tickers", () => {
    const { container } = render(<Linkified text="Nothing to link." tickers={[]} />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("Nothing to link.");
  });

  it("announces dash:open on click", () => {
    const on = vi.fn();
    document.addEventListener("dash:open", on);
    render(<Linkified text="See NVDA." tickers={["NVDA"]} />);
    fireEvent.click(screen.getByRole("link", { name: "NVDA" }));
    document.removeEventListener("dash:open", on);
    expect(on).toHaveBeenCalledTimes(1);
    expect((on.mock.calls[0][0] as CustomEvent<string>).detail).toBe("NVDA");
  });
});
