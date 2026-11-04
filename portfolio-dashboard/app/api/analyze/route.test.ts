import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadReferenceMarket } from "@/lib/testing/fromReference";

const guardRequest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/guard/guard", () => ({ guardRequest }));

const getTickerMarket = vi.hoisted(() => vi.fn());
const getBenchmarks = vi.hoisted(() => vi.fn());
vi.mock("@/lib/market", () => {
  class UnknownTicker extends Error {
    constructor(t: string) {
      super("unknown_ticker");
      this.name = "UnknownTicker";
      void t;
    }
  }
  class NoPriceError extends Error {
    constructor() {
      super("no_price");
      this.name = "NoPriceError";
    }
  }
  return { getTickerMarket, getBenchmarks, UnknownTicker, NoPriceError };
});

import { UnknownTicker, NoPriceError } from "@/lib/market";
import { POST } from "./route";

const { market: REF } = loadReferenceMarket();
const REF_KEYS = Object.keys(REF);

function post(body: unknown, headers: Record<string, string> = {}, raw?: string): Request {
  const text = raw ?? JSON.stringify(body);
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    body: text,
    headers: { "content-type": "application/json", "content-length": String(new TextEncoder().encode(text).byteLength), ...headers },
  });
}
async function lines(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
const hold = (...tickers: string[]) => ({ holdings: tickers.map((ticker) => ({ ticker, shares: 10 })) });
const refMarket = async (t: string) => {
  if (!REF[t]) throw new UnknownTicker(t);
  return REF[t];
};

beforeEach(() => {
  guardRequest.mockReset().mockResolvedValue({ ok: true });
  getTickerMarket.mockReset().mockImplementation(refMarket);
  getBenchmarks.mockReset().mockResolvedValue({ SPY: [], QQQ: [] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/analyze validation", () => {
  it("101 distinct holdings -> 400 too_many", async () => {
    const res = await POST(post(hold(...Array.from({ length: 101 }, (_, i) => `T${i}`))));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "too_many" });
    expect(getTickerMarket).not.toHaveBeenCalled();
  });

  it("0 holdings -> 400 no_holdings", async () => {
    const res = await POST(post({ holdings: [] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "no_holdings" });
  });

  it("holdings that all normalise to null -> no_holdings", async () => {
    const res = await POST(post(hold("!!!", "total")));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "no_holdings" });
  });

  it("invalid JSON -> 400 bad_request", async () => {
    const res = await POST(post(null, {}, "{nope"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("schema violations -> 400 bad_request", async () => {
    for (const b of [{}, { holdings: "x" }, { holdings: [{ ticker: "NVDA", shares: -1 }] }, { holdings: [{ ticker: "NVDA", shares: 1, cost: -5 }] }]) {
      const res = await POST(post(b));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "bad_request" });
    }
  });

  it("missing content-length -> 411", async () => {
    const req = new Request("http://localhost/api/analyze", { method: "POST", body: JSON.stringify(hold("NVDA")) });
    req.headers.delete("content-length");
    const res = await POST(req);
    expect(res.status).toBe(411);
    expect(await res.json()).toEqual({ error: "length_required" });
  });

  it("> 256 KB -> 413", async () => {
    const res = await POST(post(null, { "content-length": String(256 * 1024 + 1) }, "{}"));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "too_large" });
  });

  it("a body larger than declared is still refused", async () => {
    const big = JSON.stringify({ holdings: [{ ticker: "NVDA", shares: 1, account: "x".repeat(300 * 1024) }] });
    const res = await POST(post(null, { "content-length": "10" }, big));
    expect(res.status).toBe(413);
  });

  it("guard blocked -> its status and code; market never called", async () => {
    guardRequest.mockResolvedValue({ ok: false, status: 429, code: "rate_limited" });
    const res = await POST(post(hold("NVDA")));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(getTickerMarket).not.toHaveBeenCalled();
    expect(guardRequest).toHaveBeenCalledWith(expect.any(Request), { route: "analyze", needsCaptcha: true });
  });

  it("captcha block is 400 with no Retry-After", async () => {
    guardRequest.mockResolvedValue({ ok: false, status: 400, code: "captcha" });
    const res = await POST(post(hold("NVDA")));
    expect(res.status).toBe(400);
    expect(res.headers.get("Retry-After")).toBeNull();
    expect(await res.json()).toEqual({ error: "captcha" });
  });
});

describe("POST /api/analyze streaming", () => {
  it("normalises and merges tickers; progress precedes exactly one dashboard", async () => {
    const res = await POST(
      post({
        holdings: [
          { ticker: "nvda", shares: 10 },
          { ticker: "$nvda", shares: 5 },
          { ticker: "NVDA.US", shares: 5 },
          { ticker: "brk b", shares: 1 },
          { ticker: "MU", shares: 2 },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const out = await lines(res);
    const asked = getTickerMarket.mock.calls.map((c) => c[0]).sort();
    expect(asked).toEqual(["BRK-B", "MU", "NVDA"]);
    const progress = out.filter((l) => l.type === "progress");
    const dash = out.filter((l) => l.type === "dashboard");
    expect(progress).toHaveLength(3);
    expect(progress.every((p) => p.of === 3)).toBe(true);
    expect(progress.map((p) => p.done)).toEqual([1, 2, 3]);
    expect(dash).toHaveLength(1);
    expect(out.at(-1)?.type).toBe("dashboard");
    const data = dash[0].data as { positions: { ticker: string; qty: number }[]; failures: { ticker: string; code: string }[] };
    expect(data.positions.find((p) => p.ticker === "NVDA")?.qty).toBe(20);
    expect(data.failures).toEqual([{ ticker: "BRK-B", code: "unknown" }]);
  });

  it("one UnknownTicker among several still yields a dashboard", async () => {
    const out = await lines(await POST(post(hold("NVDA", "ZZZZ", "MU"))));
    const dash = out.find((l) => l.type === "dashboard")!.data as { failures: unknown[]; unpriced: string[]; positions: unknown[] };
    expect(dash.failures).toEqual([{ ticker: "ZZZZ", code: "unknown" }]);
    expect(dash.unpriced).toEqual(["ZZZZ"]);
    expect(dash.positions).toHaveLength(2);
  });

  it("maps NoPriceError and other errors without leaking messages", async () => {
    getTickerMarket.mockImplementation(async (t: string) => {
      if (t === "NVDA") throw new NoPriceError({});
      throw new Error("secret internal detail https://x.y/key=abc");
    });
    const res = await POST(post(hold("NVDA", "MU")));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain("secret");
    const d = JSON.parse(text.split("\n").filter(Boolean).at(-1)!).data;
    expect(d.failures).toEqual([
      { ticker: "MU", code: "failed" },
      { ticker: "NVDA", code: "no_price" },
    ]);
  });

  it("all sources throwing still returns status 200 with a dashboard", async () => {
    getTickerMarket.mockRejectedValue(new Error("boom"));
    getBenchmarks.mockRejectedValue(new Error("boom"));
    const res = await POST(post(hold("NVDA", "MU")));
    expect(res.status).toBe(200);
    const out = await lines(res);
    const d = out.at(-1)!;
    expect(d.type).toBe("dashboard");
    expect((d.data as { failures: unknown[]; total: number }).failures).toHaveLength(2);
    expect((d.data as { total: number }).total).toBe(0);
  });

  it("passes a signal to every market call", async () => {
    await (await POST(post(hold("NVDA", "MU")))).text();
    for (const c of getTickerMarket.mock.calls) expect(c[2]?.signal).toBeInstanceOf(AbortSignal);
    expect(getBenchmarks.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(getBenchmarks).toHaveBeenCalledTimes(1);
  });

  it("concurrency never exceeds 5", async () => {
    let inflight = 0;
    let peak = 0;
    getTickerMarket.mockImplementation(async (t: string) => {
      inflight++;
      peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      return refMarket(t);
    });
    await (await POST(post(hold(...REF_KEYS)))).text();
    expect(peak).toBe(5);
    expect(getTickerMarket).toHaveBeenCalledTimes(REF_KEYS.length);
  });

  it("the 50 s budget marks unstarted tickers 'deadline' and still returns a dashboard", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // Two tickers hang forever (ignoring the signal); the other workers serve the rest.
    const hang = new Set(REF_KEYS.slice(0, 2));
    getTickerMarket.mockImplementation((t: string) => (hang.has(t) ? new Promise(() => {}) : refMarket(t)));
    const res = await POST(post(hold(...REF_KEYS)));
    const pending = lines(res);
    await vi.advanceTimersByTimeAsync(50_000);
    const out = await pending;
    const last = out.at(-1)!;
    expect(last.type).toBe("dashboard");
    const d = last.data as { failures: { ticker: string; code: string }[] };
    expect(d.failures.map((f) => f.ticker).sort()).toEqual([...hang].sort());
    expect(d.failures.every((f) => f.code === "deadline")).toBe(true);
    expect(out.filter((l) => l.type === "dashboard")).toHaveLength(1);
  });

  it("tickers not yet started when the deadline fires are not fetched", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    getTickerMarket.mockImplementation(() => new Promise(() => {}));
    const res = await POST(post(hold(...REF_KEYS)));
    const pending = lines(res);
    await vi.advanceTimersByTimeAsync(50_000);
    const out = await pending;
    expect(getTickerMarket).toHaveBeenCalledTimes(5);
    const d = out.at(-1)!.data as { failures: { code: string }[] };
    expect(d.failures).toHaveLength(REF_KEYS.length);
    expect(d.failures.every((f) => f.code === "deadline")).toBe(true);
  });

  it("an AbortError from the market layer maps to deadline", async () => {
    getTickerMarket.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const out = await lines(await POST(post(hold("NVDA"))));
    expect((out.at(-1)!.data as { failures: { code: string }[] }).failures).toEqual([{ ticker: "NVDA", code: "deadline" }]);
  });
});

describe("bounds and disconnect", () => {
  const one = (o: Record<string, unknown>) => post({ holdings: [{ ticker: "NVDA", shares: 1, ...o }] });
  it("shares bound 1e9 ok, 1e9+1 rejected", async () => {
    expect((await POST(one({ shares: 1e9 }))).status).toBe(200);
    const bad = await POST(one({ shares: 1e9 + 1 }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "bad_request" });
  });
  it("cost bound 1e13 ok, 1e13+1 rejected", async () => {
    expect((await POST(one({ cost: 1e13 }))).status).toBe(200);
    expect((await POST(one({ cost: 1e13 + 1 }))).status).toBe(400);
  });
  it("aborting the request signal stops further lookups without throwing", async () => {
    const ac = new AbortController();
    getTickerMarket.mockImplementation(async (t: string) => {
      ac.abort();
      await new Promise((r) => setTimeout(r, 2));
      return refMarket(t);
    });
    const text = JSON.stringify(hold(...REF_KEYS));
    const req = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: text,
      signal: ac.signal,
      headers: { "content-type": "application/json", "content-length": String(text.length) },
    });
    const res = await POST(req);
    await expect(res.text()).resolves.toBeTypeOf("string");
    expect(getTickerMarket.mock.calls.length).toBeLessThanOrEqual(5);
  });
});

describe("privacy", () => {
  it("logs nothing about holdings or tickers", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    getTickerMarket.mockRejectedValueOnce(new Error("nvda exploded"));
    await (await POST(post(hold("NVDA", "MU", "ZZZZ")))).text();
    await POST(post(hold(...Array.from({ length: 101 }, (_, i) => `T${i}`))));
    await POST(post(null, {}, "{bad"));
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it("error bodies contain only { error }", async () => {
    const reqs = [post({ holdings: [] }), post(null, {}, "{x"), post(hold(...Array.from({ length: 101 }, (_, i) => `T${i}`)))];
    for (const r of reqs) {
      const body = await (await POST(r)).json();
      expect(Object.keys(body)).toEqual(["error"]);
    }
  });
});
