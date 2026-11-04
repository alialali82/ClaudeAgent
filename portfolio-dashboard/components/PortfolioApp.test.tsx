// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioApp } from "./PortfolioApp";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("./Turnstile", async () => {
  const { useImperativeHandle } = await import("react");
  return {
    TurnstileError: class extends Error {
      code = "captcha";
    },
    Turnstile: ({ ref }: { ref?: React.Ref<{ getToken: () => Promise<string> }> }) => {
      useImperativeHandle(ref, () => ({ getToken }));
      return null;
    },
  };
});

vi.mock("./dashboard/DashboardView", () => ({
  DashboardView: ({ dashboard }: { dashboard: { total: number; positions: unknown[]; failures: { ticker: string; code: string }[] } }) => (
    <section>
      <p>
        Dashboard ready: ${dashboard.total.toLocaleString("en-US")} across {dashboard.positions.length} positions
      </p>
      {dashboard.failures.map((f) => (
        <p key={f.ticker}>{f.ticker}</p>
      ))}
    </section>
  ),
}));

const enc = new TextEncoder();
const dash = { total: 12345, positions: [{}, {}], failures: [{ ticker: "ZZZZ", code: "unknown" }] };
const ndjson = (...lines: object[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(lines.map((l) => JSON.stringify(l) + "\n").join("")));
        c.close();
      },
    }),
  );

async function manualRow(user: ReturnType<typeof userEvent.setup>, ticker: string, shares: string) {
  await user.click(screen.getByRole("button", { name: /type holdings manually/i }));
  await user.type(screen.getByLabelText("Ticker"), ticker);
  await user.type(screen.getByLabelText("Shares"), shares);
}

let n = 0;
beforeEach(() => {
  n = 0;
  getToken.mockReset();
  getToken.mockImplementation(async () => `tok-${++n}`);
});
afterEach(() => vi.unstubAllGlobals());

describe("PortfolioApp", () => {
  it("runs manual entry to the dashboard stub, posting normalised valid rows with a token", async () => {
    const fetchMock = vi.fn(async () => ndjson({ type: "progress", done: 1, of: 1 }, { type: "dashboard", data: dash }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioApp />);
    await manualRow(user, "brk.b", "3");
    await user.click(screen.getByRole("button", { name: /^analyze/i }));
    expect(await screen.findByText(/Dashboard ready: \$12,345 across 2 positions/)).toBeInTheDocument();
    expect(screen.getByText(/ZZZZ/)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/analyze");
    expect(JSON.parse(init.body as string)).toEqual({ holdings: [{ ticker: "BRK-B", shares: 3 }] });
    expect((init.headers as Record<string, string>)["x-turnstile-token"]).toBe("tok-1");
  });

  it("shows progress while streaming", async () => {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: (c) => (ctrl = c) });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
    const user = userEvent.setup();
    render(<PortfolioApp />);
    await manualRow(user, "AAPL", "1");
    await user.click(screen.getByRole("button", { name: /^analyze/i }));
    await screen.findByRole("progressbar");
    ctrl.enqueue(enc.encode('{"type":"progress","done":3,"of":10}\n{"type":"pro'));
    await waitFor(() => expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3"));
    expect(screen.getByText(/3 of 10/)).toBeInTheDocument();
    ctrl.enqueue(enc.encode('gress","done":10,"of":10}\n'));
    await waitFor(() => expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "10"));
    ctrl.enqueue(enc.encode(JSON.stringify({ type: "dashboard", data: dash }) + "\n"));
    ctrl.close();
    expect(await screen.findByText(/Dashboard ready/)).toBeInTheDocument();
  });

  it("returns to confirm with rows intact on an error line", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ndjson({ type: "error", code: "analyze_failed" })));
    const user = userEvent.setup();
    render(<PortfolioApp />);
    await manualRow(user, "AAPL", "7");
    await user.click(screen.getByRole("button", { name: /^analyze/i }));
    expect(await screen.findByText(/The analysis failed/)).toBeInTheDocument();
    expect(screen.getByLabelText("Ticker")).toHaveValue("AAPL");
    expect(screen.getByLabelText("Shares")).toHaveValue("7");
  });

  it("maps a pre-stream status error to text and keeps rows", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "rate_limited" }, { status: 429 })));
    const user = userEvent.setup();
    render(<PortfolioApp />);
    await manualRow(user, "AAPL", "7");
    await user.click(screen.getByRole("button", { name: /^analyze/i }));
    expect(await screen.findByText("Too many requests — try again in an hour")).toBeInTheDocument();
    expect(screen.getByLabelText("Shares")).toHaveValue("7");
  });

  it("Cancel aborts the request and returns to confirm", async () => {
    let signal!: AbortSignal;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise<Response>((_res, rej) => {
            signal = init.signal as AbortSignal;
            signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
          }),
      ),
    );
    const user = userEvent.setup();
    render(<PortfolioApp />);
    await manualRow(user, "AAPL", "2");
    await user.click(screen.getByRole("button", { name: /^analyze/i }));
    await user.click(await screen.findByRole("button", { name: /cancel/i }));
    expect(signal.aborted).toBe(true);
    expect(await screen.findByLabelText("Shares")).toHaveValue("2");
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
  });

  it("requests a fresh Turnstile token for extract and again for analyze", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === "/api/extract"
        ? Response.json({ holdings: [{ ticker: "AAPL", shares: 4 }], warnings: [] })
        : ndjson({ type: "dashboard", data: dash }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioApp />);
    await user.upload(screen.getByLabelText(/choose a file/i), new File(["x"], "s.png", { type: "image/png" }));
    const li = (await screen.findAllByRole("listitem"))[0];
    expect(within(li).getByText("AI-read — check")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^analyze/i }));
    await screen.findByText(/Dashboard ready/);
    expect(getToken).toHaveBeenCalledTimes(2);
    const tokens = fetchMock.mock.calls.map((c) => ((c as unknown as [string, RequestInit])[1].headers as Record<string, string>)["x-turnstile-token"]);
    expect(tokens).toEqual(["tok-1", "tok-2"]);
  });

  it("goes spreadsheet -> mapping -> confirm and Start over resets everything", async () => {
    const user = userEvent.setup();
    render(<PortfolioApp />);
    const csv = "Ticker,Shares,Cost\nAAPL,10,1500\nMSFT,2,500\n";
    await user.upload(screen.getByLabelText(/choose a file/i), new File([csv], "p.csv", { type: "text/csv" }));
    await user.click(await screen.findByRole("button", { name: /continue/i }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /start over/i }));
    expect(screen.getByText(/Spreadsheets are read in your browser/)).toBeInTheDocument();
  });

  it("never touches web storage", async () => {
    const set = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", vi.fn(async () => ndjson({ type: "dashboard", data: dash })));
    const user = userEvent.setup();
    render(<PortfolioApp />);
    await manualRow(user, "AAPL", "1");
    await user.click(screen.getByRole("button", { name: /^analyze/i }));
    await screen.findByText(/Dashboard ready/);
    expect(set).not.toHaveBeenCalled();
    set.mockRestore();
  });
});
