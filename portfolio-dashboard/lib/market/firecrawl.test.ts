import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/guard/spend", () => ({ spendAllowed: vi.fn(async () => true) }));
import { spendAllowed } from "@/lib/guard/spend";
import { scrape, ScrapeError } from "./firecrawl";

const KEY = "fc-SECRET-KEY-123";
const URL_ = "https://stockanalysis.com/stocks/nvda/forecast/?token=abc";
const ok = (md: unknown = "# hi") =>
  new Response(JSON.stringify({ success: true, data: { markdown: md, metadata: {} } }), { status: 200 });
const spies = () => (["log", "warn", "error", "info", "debug"] as const).map((m) => vi.spyOn(console, m));

beforeEach(() => {
  process.env.FIRECRAWL_API_KEY = KEY;
  vi.mocked(spendAllowed).mockReset();
  vi.mocked(spendAllowed).mockResolvedValue(true);
});
afterEach(() => {
  delete process.env.FIRECRAWL_API_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("scrape", () => {
  it("POSTs the v2 scrape request and returns markdown", async () => {
    const f = vi.fn(async () => ok("# page"));
    vi.stubGlobal("fetch", f);
    const s = spies();
    expect(await scrape(URL_, { maxAgeMs: 3600_000 })).toBe("# page");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(init.method).toBe("POST");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe(`Bearer ${KEY}`);
    expect(h["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      url: URL_,
      formats: ["markdown"],
      onlyMainContent: true,
      maxAge: 3600_000,
    });
    expect(spendAllowed).toHaveBeenCalledWith("firecrawl", 1);
    s.forEach((x) => expect(x).not.toHaveBeenCalled());
  });

  it("429 then 200 retries once (and the retry is budget-checked)", async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockResolvedValueOnce(new Response("slow down", { status: 429 })).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", f);
    const p = scrape(URL_);
    await vi.advanceTimersByTimeAsync(600);
    expect(await p).toBe("# hi");
    expect(f).toHaveBeenCalledTimes(2);
    expect(spendAllowed).toHaveBeenCalledTimes(2);
  });

  it("second failure throws and never leaks key/url/body", async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => new Response(`boom ${KEY} ${URL_}`, { status: 503 }));
    vi.stubGlobal("fetch", f);
    const s = spies();
    const p = scrape(URL_).catch((e) => e);
    await vi.advanceTimersByTimeAsync(600);
    const e = await p;
    expect(e).toBeInstanceOf(ScrapeError);
    expect(e.code).toBe("failed");
    expect(f).toHaveBeenCalledTimes(2);
    expect(JSON.stringify([e.message, e.code, e.stack?.split("\n")[0]])).not.toMatch(/SECRET|token=|stockanalysis/);
    s.forEach((x) => expect(x).not.toHaveBeenCalled());
  });

  it("retry denied by budget throws budget", async () => {
    vi.useFakeTimers();
    vi.mocked(spendAllowed).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const f = vi.fn(async () => new Response("", { status: 500 }));
    vi.stubGlobal("fetch", f);
    const p = scrape(URL_).catch((e) => e);
    await vi.advanceTimersByTimeAsync(600);
    expect((await p).code).toBe("budget");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("budget denial throws budget without fetching", async () => {
    vi.mocked(spendAllowed).mockResolvedValue(false);
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const e = await scrape(URL_).catch((x) => x);
    expect(e).toBeInstanceOf(ScrapeError);
    expect(e.code).toBe("budget");
    expect(f).not.toHaveBeenCalled();
  });

  it("missing key throws unavailable without fetching or spending", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const e = await scrape(URL_).catch((x) => x);
    expect(e.code).toBe("unavailable");
    expect(f).not.toHaveBeenCalled();
    expect(spendAllowed).not.toHaveBeenCalled();
  });

  it.each([401, 403])("%i is auth and is not retried", async (status) => {
    const f = vi.fn(async () => new Response("", { status }));
    vi.stubGlobal("fetch", f);
    expect((await scrape(URL_).catch((x) => x)).code).toBe("auth");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("other 4xx is failed, not retried", async () => {
    const f = vi.fn(async () => new Response("", { status: 400 }));
    vi.stubGlobal("fetch", f);
    expect((await scrape(URL_).catch((x) => x)).code).toBe("failed");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["success false", JSON.stringify({ success: false, data: { markdown: "x" } })],
    ["missing markdown", JSON.stringify({ success: true, data: {} })],
    ["blank markdown", JSON.stringify({ success: true, data: { markdown: "  " } })],
    ["not json", "<html>"],
  ])("200 with %s is empty", async (_n, body) => {
    vi.stubGlobal("fetch", async () => new Response(body, { status: 200 }));
    expect((await scrape(URL_).catch((x) => x)).code).toBe("empty");
  });

  it("markdown over 1 MB is rejected as empty", async () => {
    vi.stubGlobal("fetch", async () => ok("x".repeat(1_000_001)));
    expect((await scrape(URL_).catch((e) => e)).code).toBe("empty");
  });
  it("markdown of exactly 1 MB is accepted", async () => {
    vi.stubGlobal("fetch", async () => ok("x".repeat(1_000_000)));
    expect((await scrape(URL_)).length).toBe(1_000_000);
  });

  it("timeout is NOT retried: one fetch, one spend, code timeout", async () => {
    const fx = vi.fn(async () => {
      throw new DOMException("t", "TimeoutError");
    });
    vi.stubGlobal("fetch", fx);
    expect((await scrape(URL_).catch((e) => e)).code).toBe("timeout");
    expect(fx).toHaveBeenCalledTimes(1);
    expect(spendAllowed).toHaveBeenCalledTimes(1);
  });

  it("uses a 15 s timeout", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    await scrape(URL_);
    expect(spy).toHaveBeenCalledWith(15_000);
  });

  it("already-aborted signal: no spend, no fetch, code deadline", async () => {
    const fx = vi.fn();
    vi.stubGlobal("fetch", fx);
    const c = new AbortController();
    c.abort();
    expect((await scrape(URL_, { signal: c.signal }).catch((e) => e)).code).toBe("deadline");
    expect(fx).not.toHaveBeenCalled();
    expect(spendAllowed).not.toHaveBeenCalled();
  });

  it("abort mid-flight gives deadline", async () => {
    vi.stubGlobal(
      "fetch",
      (_u: string, init: RequestInit) =>
        new Promise((_r, rej) => init.signal?.addEventListener("abort", () => rej(init.signal?.reason))),
    );
    const c = new AbortController();
    const p = scrape(URL_, { signal: c.signal }).catch((e) => e);
    setTimeout(() => c.abort(), 10);
    expect((await p).code).toBe("deadline");
  });

  it("abort during the retry delay stops before the second spend", async () => {
    vi.useFakeTimers();
    const fx = vi.fn(async () => new Response("", { status: 429 }));
    vi.stubGlobal("fetch", fx);
    const c = new AbortController();
    const p = scrape(URL_, { signal: c.signal }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(100);
    c.abort();
    await vi.advanceTimersByTimeAsync(600);
    expect((await p).code).toBe("deadline");
    expect(fx).toHaveBeenCalledTimes(1);
    expect(spendAllowed).toHaveBeenCalledTimes(1);
  });
});
