// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/limits";
import { UploadStep } from "./UploadStep";

const fixture = (n: string) => new File([readFileSync(join(__dirname, "../lib/parse/__fixtures__", n))], n);
const setup = () => {
  const props = {
    onSheets: vi.fn(),
    onHoldings: vi.fn(),
    onManual: vi.fn(),
    getToken: vi.fn(async () => "tok"),
  };
  render(<UploadStep {...props} />);
  const input = screen.getByLabelText(/choose a file/i) as HTMLInputElement;
  const user = userEvent.setup({ applyAccept: false });
  return { props, input, user };
};
afterEach(() => vi.unstubAllGlobals());

describe("UploadStep", () => {
  it("states the cap and privacy line", () => {
    setup();
    expect(screen.getByText(/up to 4 MB/)).toBeInTheDocument();
    expect(
      screen.getByText("Spreadsheets are read in your browser. Images and PDFs are sent to be read by AI and discarded. Nothing is stored."),
    ).toBeInTheDocument();
  });

  it("shows 'Save as .xlsx' for an .xls file", async () => {
    const { user, input, props } = setup();
    await user.upload(input, new File(["x"], "old.xls"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save as .xlsx");
    expect(props.onSheets).not.toHaveBeenCalled();
  });

  it("refuses an over-size file before any fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { user, input, props } = setup();
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: MAX_UPLOAD_BYTES + 1 });
    await user.upload(input, big);
    expect(await screen.findByRole("alert")).toHaveTextContent(/too large.*4 MB/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(props.getToken).not.toHaveBeenCalled();
  });

  it("rejects unsupported types with a message", async () => {
    const { user, input } = setup();
    await user.upload(input, new File(["x"], "notes.txt", { type: "text/plain" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't supported/i);
  });

  it("reads a spreadsheet locally and hands sheets over", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { user, input, props } = setup();
    await user.upload(input, fixture("two-sheets.xlsx"));
    await waitFor(() => expect(props.onSheets).toHaveBeenCalled());
    expect(props.onSheets.mock.calls[0][0]).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends an image to /api/extract and tags rows as AI-read", async () => {
    const fetchMock = vi.fn(async () => Response.json({ holdings: [{ ticker: "AAPL", shares: 3 }], warnings: ["blurry"] }));
    vi.stubGlobal("fetch", fetchMock);
    const { user, input, props } = setup();
    await user.upload(input, new File(["x"], "shot.png", { type: "image/png" }));
    await waitFor(() => expect(props.onHoldings).toHaveBeenCalled());
    expect(props.onHoldings).toHaveBeenCalledWith([{ ticker: "AAPL", shares: 3 }], ["blurry"], "ai");
    expect(props.getToken).toHaveBeenCalledTimes(1);
  });

  it("shows an aria-live status while reading", async () => {
    let release!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (release = r))));
    const { user, input } = setup();
    await user.upload(input, new File(["x"], "s.pdf", { type: "application/pdf" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Reading your file…");
    expect(status).toHaveAttribute("aria-live", "polite");
    release(Response.json({ holdings: [], warnings: [] }));
  });

  it.each([
    ["rate_limited", 429, "Too many requests — try again in an hour"],
    ["busy", 503, "The service is busy today — try again later"],
    ["captcha", 403, "Verification failed — reload the page"],
    ["too_many_pages", 422, "PDFs are limited to 10 pages"],
    ["extract_invalid_output", 422, "We couldn't read that file — try a clearer image or enter holdings manually"],
  ])("maps extract error %s to human text", async (code, status, text) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: code }, { status })));
    const { user, input } = setup();
    await user.upload(input, new File(["x"], "s.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });

  it("loads a saved holdings JSON file", async () => {
    const { user, input, props } = setup();
    const json = JSON.stringify({ version: 1, holdings: [{ ticker: "MSFT", shares: 2, cost: 10, costKind: "total" }] });
    await user.upload(input, new File([json], "h.json", { type: "application/json" }));
    await waitFor(() => expect(props.onHoldings).toHaveBeenCalled());
    expect(props.onHoldings).toHaveBeenCalledWith([{ ticker: "MSFT", shares: 2, cost: 10, costKind: "total" }], [], "file");
  });

  it("rejects an invalid JSON file", async () => {
    const { user, input, props } = setup();
    await user.upload(input, new File(['{"holdings":[{"ticker":"X","shares":-1}]}'], "h.json", { type: "application/json" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/saved holdings file/i);
    expect(props.onHoldings).not.toHaveBeenCalled();
  });

  it("offers manual entry", async () => {
    const { user, props } = setup();
    await user.click(screen.getByRole("button", { name: /type holdings manually/i }));
    expect(props.onManual).toHaveBeenCalled();
  });
});
