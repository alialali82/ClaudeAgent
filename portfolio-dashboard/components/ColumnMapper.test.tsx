// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readFileRows } from "@/lib/parse/excel";
import { ColumnMapper } from "./ColumnMapper";

const load = async (n: string) =>
  (await readFileRows(new File([readFileSync(join(__dirname, "../lib/parse/__fixtures__", n))], n))).sheets;

describe("ColumnMapper", () => {
  it("pre-fills guesses, lets the user change them and continues with parsed holdings", async () => {
    const sheets = await load("clean.xlsx");
    const onConfirm = vi.fn();
    render(<ColumnMapper sheets={sheets} onConfirm={onConfirm} onBack={() => {}} />);
    expect(screen.getByLabelText("Ticker")).toHaveDisplayValue("Ticker");
    expect(screen.getByLabelText("Shares")).toHaveDisplayValue("Shares");
    expect(screen.getByLabelText("Cost")).toHaveDisplayValue("Avg price");
    expect(screen.getByLabelText("Cost type")).toHaveDisplayValue("Per share");
    expect(screen.getByLabelText("Account")).toHaveDisplayValue("Account");
    expect(screen.getByLabelText("Open date")).toHaveDisplayValue("Open date");
    expect(screen.getAllByRole("row")).toHaveLength(1 + 3); // header + up to 5 data rows (3 here)

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Cost type"), "Total");
    await user.selectOptions(screen.getByLabelText("Account"), "— none —");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    const [holdings] = onConfirm.mock.calls[0];
    expect(holdings[0]).toEqual({ ticker: "AAAA", shares: 10, cost: 12.5, costKind: "total", openDate: "2023-01-15" });
  });

  it("disables Continue until ticker and shares are mapped", async () => {
    const sheets = await load("clean.xlsx");
    render(<ColumnMapper sheets={sheets} onConfirm={() => {}} onBack={() => {}} />);
    const btn = screen.getByRole("button", { name: /continue/i });
    expect(btn).toBeEnabled();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Shares"), "— none —");
    expect(btn).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Shares"), "Shares");
    expect(btn).toBeEnabled();
    await user.selectOptions(screen.getByLabelText("Ticker"), "— none —");
    expect(btn).toBeDisabled();
  });

  it("shows a sheet picker for multi-sheet workbooks and re-detects columns per sheet", async () => {
    const sheets = await load("two-sheets.xlsx");
    expect(sheets).toHaveLength(2);
    render(<ColumnMapper sheets={sheets} onConfirm={() => {}} onBack={() => {}} />);
    const picker = screen.getByLabelText("Sheet");
    expect(picker).toBeInTheDocument();
    const user = userEvent.setup();
    await user.selectOptions(picker, sheets[1].name);
    expect(picker).toHaveDisplayValue(sheets[1].name);
  });

  it("hides the sheet picker for a single sheet", async () => {
    const sheets = await load("clean.xlsx");
    render(<ColumnMapper sheets={sheets} onConfirm={() => {}} onBack={() => {}} />);
    expect(screen.queryByLabelText("Sheet")).not.toBeInTheDocument();
  });
});
