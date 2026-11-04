// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSavedHoldings } from "@/lib/files";
import { holdingToRow, newRow, type Row } from "@/lib/rows";
import type { Holding } from "@/lib/types";
import { ConfirmTable } from "./ConfirmTable";

function Harness({ initial, onAnalyze, warnings = [] }: { initial: Row[]; onAnalyze: (h: Holding[]) => void; warnings?: string[] }) {
  const [rows, setRows] = useState(initial);
  return <ConfirmTable rows={rows} onChange={setRows} onAnalyze={onAnalyze} warnings={warnings} />;
}
const row = (p: Partial<Row>): Row => ({ ...newRow(), ...p });
const analyzeBtn = () => screen.getByText(/^analyze/i).closest("button")!;
const items = () => screen.getAllByRole("listitem");

afterEach(() => vi.restoreAllMocks());

describe("ConfirmTable", () => {
  it("disables Analyze until at least one valid row exists", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[newRow()]} onAnalyze={() => {}} />);
    expect(analyzeBtn()).toBeDisabled();
    const li = items()[0];
    await user.type(within(li).getByLabelText("Ticker"), "aapl");
    expect(analyzeBtn()).toBeDisabled();
    await user.type(within(li).getByLabelText("Shares"), "5");
    expect(analyzeBtn()).toBeEnabled();
  });

  it("tags AI-read rows", () => {
    render(
      <Harness
        initial={[holdingToRow({ ticker: "AAPL", shares: 1 }, "ai"), holdingToRow({ ticker: "MSFT", shares: 1 })]}
        onAnalyze={() => {}}
      />,
    );
    expect(within(items()[0]).getByText("AI-read — check")).toBeInTheDocument();
    expect(within(items()[1]).queryByText("AI-read — check")).not.toBeInTheDocument();
  });

  it("editing shares updates the row and clears its warning", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[row({ ticker: "AAPL", shares: "0" })]} onAnalyze={() => {}} />);
    const li = items()[0];
    const shares = within(li).getByLabelText("Shares");
    expect(within(li).getByText(/shares must be greater than 0/i)).toBeInTheDocument();
    expect(shares).toHaveAttribute("aria-invalid", "true");
    expect(shares.getAttribute("aria-describedby")).toBeTruthy();
    await user.clear(shares);
    await user.type(shares, "12");
    expect(shares).toHaveValue("12");
    expect(within(li).queryByText(/shares must be greater than 0/i)).not.toBeInTheDocument();
    expect(shares).not.toHaveAttribute("aria-invalid", "true");
  });

  it("flags unknown tickers, shows the normalised ticker on blur, flags missing cost", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[row({ ticker: "", shares: "1" }), row({ ticker: "brk.b", shares: "1" })]} onAnalyze={() => {}} />);
    const first = items()[0];
    await user.type(within(first).getByLabelText("Ticker"), "BP.L");
    expect(within(first).getByText(/ticker not recognised/i)).toBeInTheDocument();
    const second = items()[1];
    await user.click(within(second).getByLabelText("Ticker"));
    await user.tab();
    expect(within(second).getByLabelText("Ticker")).toHaveValue("BRK-B");
    expect(within(second).getByText(/no cost: excluded from return/i)).toBeInTheDocument();
  });

  it("shows the limit banner and disables Analyze above 100 rows", () => {
    const rows = Array.from({ length: 101 }, (_, i) => row({ ticker: "AAPL", shares: "1", account: `a${i}` }));
    render(<Harness initial={rows} onAnalyze={() => {}} />);
    expect(screen.getByText(/max 100 holdings/i)).toHaveAttribute("role", "alert");
    expect(analyzeBtn()).toBeDisabled();
  });

  it("warns about duplicates and merges them on submit", async () => {
    const onAnalyze = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          row({ ticker: "aapl", shares: "2", cost: "100", costKind: "total" }),
          row({ ticker: "AAPL", shares: "3", cost: "50", costKind: "perShare" }),
        ]}
        onAnalyze={onAnalyze}
      />,
    );
    expect(within(items()[0]).getByText(/merged/i)).toBeInTheDocument();
    await user.click(analyzeBtn());
    expect(onAnalyze).toHaveBeenCalledWith([{ ticker: "AAPL", shares: 5, cost: 250, costKind: "total" }]);
  });

  it("sends only valid rows with normalised tickers", async () => {
    const onAnalyze = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          row({ ticker: " nvda.us ", shares: "1,5".replace(",", ".") , account: " Main " }),
          row({ ticker: "BP.L", shares: "4" }),
          row({ ticker: "MSFT", shares: "-1" }),
          row({ ticker: "", shares: "" }),
          row({ ticker: "brk.b", shares: "2", openDate: "2023-01-02", cost: "10", costKind: "perShare" }),
        ]}
        onAnalyze={onAnalyze}
      />,
    );
    await user.click(analyzeBtn());
    expect(onAnalyze).toHaveBeenCalledWith([
      { ticker: "NVDA", shares: 1.5, account: "Main" },
      { ticker: "BRK-B", shares: 2, cost: 10, costKind: "perShare", openDate: "2023-01-02" },
    ]);
  });

  it("adds and deletes rows", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[row({ ticker: "AAPL", shares: "1" })]} onAnalyze={() => {}} />);
    await user.click(screen.getByRole("button", { name: /add row/i }));
    expect(items()).toHaveLength(2);
    await user.click(within(items()[0]).getByRole("button", { name: /delete row/i }));
    expect(items()).toHaveLength(1);
  });

  it("shows dismissible extraction warnings", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[newRow()]} onAnalyze={() => {}} warnings={["Row 4: could not read"]} />);
    expect(screen.getByText("Row 4: could not read")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("Row 4: could not read")).not.toBeInTheDocument();
  });

  it("saves holdings as JSON that loads back (round trip) without any server call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return "blob:x";
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();
    const h: Holding[] = [{ ticker: "AAPL", shares: 2, cost: 10, costKind: "total", account: "A", openDate: "2022-02-02" }];
    render(<Harness initial={h.map((x) => holdingToRow(x))} onAnalyze={() => {}} />);
    await user.click(screen.getByRole("button", { name: /save my holdings/i }));
    expect(click).toHaveBeenCalled();
    expect(parseSavedHoldings(await blob!.text())).toEqual(h);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("flags out-of-range values like the server and excludes those rows from the post", async () => {
    const onAnalyze = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          row({ ticker: "AAA", shares: "1" }),
          row({ ticker: "BBB", shares: "99999999999" }),
          row({ ticker: "CCC", shares: "1", cost: "10000000000000", costKind: "total" }),
          row({ ticker: "DDD", shares: "1", cost: "10000000000001", costKind: "total" }),
          row({ ticker: "EEE", shares: "1", account: "x".repeat(65) }),
          row({ ticker: "FFF", shares: "1", openDate: "2023-02-30" }),
          row({ ticker: "GGG", shares: "1", account: "x".repeat(64), openDate: "2023-02-28" }),
        ]}
        onAnalyze={onAnalyze}
      />,
    );
    const li = items();
    expect(within(li[1]).getByText("Shares must be between 0 and 1,000,000,000")).toBeInTheDocument();
    expect(within(li[2]).queryByText("Cost is too large")).not.toBeInTheDocument();
    expect(within(li[3]).getByText("Cost is too large")).toBeInTheDocument();
    expect(within(li[4]).getByText("Account name is too long (max 64)")).toBeInTheDocument();
    expect(within(li[5]).getByText("Open date is not a valid date")).toBeInTheDocument();
    expect(within(li[6]).queryByText(/too long|valid date/)).not.toBeInTheDocument();
    await user.click(analyzeBtn());
    const sent = onAnalyze.mock.calls[0][0] as Holding[];
    expect(sent.map((h) => h.ticker)).toEqual(["AAA", "CCC", "GGG"]);
  });

  it("flags typed huge shares inline", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[newRow()]} onAnalyze={() => {}} />);
    await user.type(screen.getByLabelText("Ticker"), "AAPL");
    await user.type(screen.getByLabelText("Shares"), "99999999999");
    expect(screen.getByText(/between 0 and 1,000,000,000/)).toBeInTheDocument();
    expect(analyzeBtn()).toBeDisabled();
  });

  it("never touches web storage", async () => {
    const set = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    render(<Harness initial={[newRow()]} onAnalyze={() => {}} />);
    await user.type(screen.getByLabelText("Ticker"), "AAPL");
    expect(set).not.toHaveBeenCalled();
  });
});
