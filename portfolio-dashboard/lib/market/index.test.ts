import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryKv, setKvForTests, type Kv } from "@/lib/kv";
import { getBenchmarks, getTickerMarket, NoPriceError, UnknownTicker } from "./index";

vi.mock("@/lib/guard/spend", () => ({ spendAllowed: vi.fn(async () => true) }));
import { spendAllowed } from "@/lib/guard/spend";

const read = (n: string) => readFileSync(fileURLToPath(new URL(`./__fixtures__/${n}`, import.meta.url)), "utf8");
const json = (n: string) => JSON.parse(read(n));
const NOW = new Date("2026-11-04T15:00:00Z");

type Handler = (url: string, body?: { url?: string }) => Response | Promise<Response>;
let kv: Kv;
let calls: string[];

/** Synthetic SPY chart: NVDA's timestamps with a smooth, correlated close series. */
function spyChart() {
  const c = json("yahoo-chart-nvda.json");
  const q = c.chart.result[0].indicators.quote[0];
  q.close = q.close.map((v: number | null, i: number) => (v == null ? v : 400 + v * 0.3 + Math.sin(i / 3)));
  c.chart.result[0].meta.symbol = "SPY";
  return c;
}

function stub(over: Partial<Record<string, Handler>> = {}) {
  const base: Record<string, Handler> = {
    "yahoo:NVDA": () => new Response(read("yahoo-chart-nvda.json")),
    "yahoo:SPY": () => new Response(JSON.stringify(spyChart())),
    "yahoo:QQQ": () => new Response(JSON.stringify(spyChart())),
    "sa:forecast": () => new Response(ok(read("stockanalysis-forecast-nvda.md"))),
    "sa:ratings": () => new Response(ok(read("stockanalysis-ratings-nvda.md"))),
    "nq:targetprice": () => new Response(read("nasdaq-targetprice-nvda.json")),
    "nq:earnings-date": () => new Response(read("nasdaq-earnings-date-nvda.json")),
    "nq:earnings-surprise": () => new Response(read("nasdaq-earnings-surprise-nvda.json")),
    "nq:company-profile": () => new Response(read("nasdaq-profile-nvda.json")),
  };
  const h = { ...base, ...over } as Record<string, Handler>;
  const f = vi.fn(async (input: string, init?: RequestInit) => {
    calls.push(input);
    const body = init?.body ? (JSON.parse(init.body as string) as { url: string }) : undefined;
    let key: string;
    if (input.includes("finance.yahoo.com")) key = `yahoo:${/chart\/([^?]+)/.exec(input)![1]}`;
    else if (input.includes("firecrawl.dev")) key = `sa:${body!.url.includes("/ratings/") ? "ratings" : "forecast"}`;
    else key = `nq:${input.split("/").pop()}`;
    const fn = h[key] ?? h[key.replace(/:.*/, ":*")];
    if (!fn) throw new Error(`unstubbed ${key}`);
    return fn(input, body);
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const ok = (md: string) => JSON.stringify({ success: true, data: { markdown: md, metadata: {} } });
const fail = (status: number): Handler => () => new Response("x", { status });

beforeEach(() => {
  kv = createMemoryKv();
  setKvForTests(kv);
  calls = [];
  process.env.FIRECRAWL_API_KEY = "fc-test";
  vi.mocked(spendAllowed).mockReset();
  vi.mocked(spendAllowed).mockResolvedValue(true);
});
afterEach(() => {
  setKvForTests(null);
  delete process.env.FIRECRAWL_API_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const consoleSpies = () => (["log", "warn", "error", "info", "debug"] as const).map((m) => vi.spyOn(console, m));

describe("getTickerMarket (NVDA, all sources from fixtures)", () => {
  it("assembles the market object", async () => {
    stub();
    const s = consoleSpies();
    const m = await getTickerMarket("nvda", NOW);
    expect(m.ticker).toBe("NVDA");
    expect(m.name).toBe("NVIDIA Corporation");
    expect(m.price).toBe(202.35);
    expect(m.prevClose).toBeCloseTo(206.69, 2);
    expect(m.closes).toHaveLength(252);
    expect(m.sp).toMatchObject({ avg: 327.14, n: 62 });
    expect(m.zacks).toMatchObject({ avg: 322.5, low: 275, high: 465 });
    expect(m.sector).toBe("Technology");
    expect(m.next).toMatchObject({ date: "2026-11-17", conf: false });
    expect(m.er?.hist).toHaveLength(4);
    for (const [d, sur, mv] of m.er!.hist) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Math.abs(sur ?? 0)).toBeLessThan(100);
      expect(mv === null || Math.abs(mv) < 100).toBe(true);
    }
    expect(Number.isFinite(m.beta)).toBe(true);
    expect(m.modeled).toBeUndefined();
    expect(m.errors).toEqual({});
    s.forEach((x) => expect(x).not.toHaveBeenCalled());
  });

  it("merges both StockAnalysis pages without duplicates, newest first, tgtDate = newest call", async () => {
    stub();
    const m = await getTickerMarket("NVDA", NOW);
    const keys = m.calls.map((c) => c.join("|"));
    expect(new Set(keys).size).toBe(keys.length);
    expect(m.calls.length).toBe(6); // ratings page: 8 rows, 2 with n/a targets skipped; forecast page rows are a subset
    const dates = m.calls.map((c) => c[2]);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(m.tgtDate).toBe(dates[0]);
    expect(m.calls.find((c) => c[0] === "Barclays")).toEqual(["Barclays", 275, "2026-10-26"]);
  });

  it("second call within TTL makes zero network calls", async () => {
    const f = stub();
    await getTickerMarket("NVDA", NOW);
    const n = f.mock.calls.length;
    expect(n).toBeGreaterThan(0);
    await getTickerMarket("NVDA", NOW);
    expect(f.mock.calls.length).toBe(n);
  });

  it("starts exactly 8 requests for a cold ticker (yahoo, 2 scrapes, 4 nasdaq, SPY; no QQQ)", async () => {
    const f = stub();
    await getTickerMarket("NVDA", NOW);
    expect(f.mock.calls.length).toBe(8);
    expect(calls.some((u) => u.includes("/chart/QQQ"))).toBe(false);
    expect(calls.filter((u) => u.includes("firecrawl")).length).toBe(2);
  });

  it("beta is null with errors.beta when the SPY series is unavailable", async () => {
    stub({ "yahoo:SPY": fail(500) });
    const m = await getTickerMarket("NVDA", NOW);
    expect(m.beta).toBeNull();
    expect(m.errors.beta).toBe("unavailable");
    expect(m.sp).not.toBeNull();
  });

  it("symbol mapping: BRK.B uses per-source symbols", async () => {
    const f = stub({
      "yahoo:BRK-B": () => new Response(read("yahoo-chart-nvda.json")),
      "sa:*": () => new Response(ok(read("stockanalysis-forecast-mram.md"))),
      "nq:*": () => new Response('{"data":null}'),
    });
    const m = await getTickerMarket("brk.b", NOW);
    expect(m.ticker).toBe("BRK-B");
    expect(calls.some((u) => u.includes("/chart/BRK-B?"))).toBe(true);
    expect(calls.some((u) => u.includes("/analyst/BRK.B/targetprice"))).toBe(true);
    const sa = f.mock.calls.filter((c) => String(c[0]).includes("firecrawl")).map((c) => JSON.parse((c[1] as RequestInit).body as string).url);
    expect(sa).toContain("https://stockanalysis.com/stocks/brk.b/forecast/");
  });
});

describe("single-source failures", () => {
  const cases: [string, Record<string, Handler>, string, string, (m: Awaited<ReturnType<typeof getTickerMarket>>) => void][] = [
    ["stockanalysis", { "sa:forecast": fail(403), "sa:ratings": fail(403) }, "stockanalysis", "auth", (m) => expect(m.sp).toBeNull()],
    ["nasdaq_targets", { "nq:targetprice": fail(403) }, "nasdaq_targets", "http_403", (m) => expect(m.zacks).toBeNull()],
    ["nasdaq_earnings", { "nq:earnings-date": fail(500), "nq:earnings-surprise": fail(500) }, "nasdaq_earnings", "http_500", (m) => expect(m.next).toBeUndefined()],
    ["nasdaq_profile", { "nq:company-profile": fail(429) }, "nasdaq_profile", "http_429", (m) => expect(m.sector).toBeUndefined()],
  ];
  it.each(cases)("%s failing sets its own errors key and leaves the rest intact", async (_n, over, key, code, extra) => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    stub(over);
    const p = getTickerMarket("NVDA", NOW);
    await vi.advanceTimersByTimeAsync(1000);
    const m = await p;
    expect(m.errors[key]).toBe(code);
    expect(Object.keys(m.errors)).toEqual([key]);
    extra(m);
    expect(m.price).toBe(202.35);
    expect(m.errors[key]).not.toMatch(/\s/);
  });

  it("budget denial on every scrape -> sp null, errors.stockanalysis = budget, no scrape fetch", async () => {
    vi.mocked(spendAllowed).mockResolvedValue(false);
    const f = stub();
    const s = consoleSpies();
    const m = await getTickerMarket("NVDA", NOW);
    expect(m.sp).toBeNull();
    expect(m.calls).toEqual([]);
    expect(m.errors.stockanalysis).toBe("budget");
    expect(f.mock.calls.some((c) => String(c[0]).includes("firecrawl"))).toBe(false);
    expect(m.zacks).not.toBeNull();
    s.forEach((x) => expect(x).not.toHaveBeenCalled());
  });

  it("missing FIRECRAWL_API_KEY -> errors.stockanalysis = unavailable", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    stub();
    expect((await getTickerMarket("NVDA", NOW)).errors.stockanalysis).toBe("unavailable");
  });

  it("an unparseable StockAnalysis page records parse", async () => {
    stub({ "sa:forecast": () => new Response(ok("# nothing here")), "sa:ratings": () => new Response(ok("# nothing")) });
    const m = await getTickerMarket("NVDA", NOW);
    expect(m.sp).toBeNull();
    expect(m.errors.stockanalysis).toBe("parse");
  });

  it("Yahoo failing with no price throws no_price carrying errors.yahoo, without console output", async () => {
    stub({ "yahoo:NVDA": fail(500) });
    const s = consoleSpies();
    const e = (await getTickerMarket("NVDA", NOW).catch((x) => x)) as NoPriceError;
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(NoPriceError);
    expect(e.message).toBe("no_price");
    expect(e.errors.yahoo).toBe("http_500");
    s.forEach((x) => expect(x).not.toHaveBeenCalled());
  });
});

describe("unknown tickers", () => {
  const notFound = () =>
    new Response(JSON.stringify({ chart: { result: null, error: { code: "Not Found", description: "x" } } }));

  it("Yahoo Not Found -> UnknownTicker, negative-cached (no refetch)", async () => {
    const f = stub({ "yahoo:ZZZZ": notFound });
    const e = await getTickerMarket("ZZZZ", NOW).catch((x) => x);
    expect(e).toBeInstanceOf(UnknownTicker);
    expect(e.ticker).toBe("ZZZZ");
    const n = f.mock.calls.length;
    await expect(getTickerMarket("ZZZZ", NOW)).rejects.toBeInstanceOf(UnknownTicker);
    expect(f.mock.calls.length).toBe(n);
  });

  it("Yahoo HTTP 404 is also unknown", async () => {
    stub({ "yahoo:ZZZZ": fail(404), "sa:*": fail(404), "nq:*": () => new Response('{"data":null}') });
    await expect(getTickerMarket("ZZZZ", NOW)).rejects.toBeInstanceOf(UnknownTicker);
  });

  it("malformed ticker is rejected without any network call", async () => {
    const f = stub();
    await expect(getTickerMarket("../etc?x=1", NOW)).rejects.toBeInstanceOf(UnknownTicker);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("thin / missing coverage", () => {
  it("MRAM thin coverage -> n 4", async () => {
    stub({
      "sa:forecast": () => new Response(ok(read("stockanalysis-forecast-mram.md"))),
      "sa:ratings": () => new Response(ok(read("stockanalysis-forecast-mram.md"))),
    });
    const m = await getTickerMarket("NVDA", NOW);
    expect(m.sp?.n).toBe(4);
  });

  it("no analyst page and Nasdaq data:null -> sp null, zacks null, no throw", async () => {
    stub({
      "sa:forecast": () => new Response(ok("# 404 Page not found")),
      "sa:ratings": () => new Response(ok("# 404 Page not found")),
      "nq:targetprice": () => new Response('{"data":null,"status":{"rCode":400}}'),
    });
    const m = await getTickerMarket("NVDA", NOW);
    expect(m.sp).toBeNull();
    expect(m.zacks).toBeNull();
    expect(m.calls).toEqual([]);
    expect(m.tgtDate).toBeUndefined();
    expect(m.errors.nasdaq_targets).toBeUndefined();
  });
});

describe("prevTargets snapshots", () => {
  it("writes today's snapshot with a 4-day TTL and reads yesterday's", async () => {
    stub();
    await kv.set("tgtsnap:NVDA:2026-11-03", { sp: { avg: 300, low: 200, high: 400, n: 60 }, zacks: null }, 100);
    const set = vi.spyOn(kv, "set");
    const m = await getTickerMarket("NVDA", NOW);
    expect(m.prevTargets).toEqual({ sp: { avg: 300, low: 200, high: 400, n: 60 }, zacks: null });
    const snap = set.mock.calls.find((c) => c[0] === "tgtsnap:NVDA:2026-11-04");
    expect(snap?.[2]).toBe(4 * 86400);
    expect(snap?.[1]).toMatchObject({ sp: { avg: 327.14 }, zacks: { avg: 322.5 } });
  });

  it("falls back to 2 and 3 days back; undefined when none; ignores KV errors", async () => {
    stub();
    await kv.set("tgtsnap:NVDA:2026-11-01", { sp: null, zacks: { avg: 1, low: 1, high: 1 } }, 100);
    expect((await getTickerMarket("NVDA", NOW)).prevTargets?.zacks?.avg).toBe(1);
    setKvForTests(createMemoryKv());
    expect((await getTickerMarket("NVDA", NOW)).prevTargets).toBeUndefined();
    const bad = createMemoryKv();
    vi.spyOn(bad, "get").mockRejectedValue(new Error("down"));
    vi.spyOn(bad, "set").mockRejectedValue(new Error("down"));
    setKvForTests(bad);
    const m = await getTickerMarket("NVDA", NOW);
    expect(m.price).toBe(202.35);
    expect(m.prevTargets).toBeUndefined();
  });
});

describe("getBenchmarks", () => {
  it("returns SPY and QQQ closes; a failed one becomes []", async () => {
    stub({ "yahoo:QQQ": fail(500) });
    const b = await getBenchmarks(NOW);
    expect(b.SPY.length).toBeGreaterThan(200);
    expect(b.QQQ).toEqual([]);
  });
});

describe("gating on a resolved Yahoo price", () => {
  const notFound = () =>
    new Response(JSON.stringify({ chart: { result: null, error: { code: "Not Found", description: "x" } } }));
  const fcCalls = (f: ReturnType<typeof stub>) => f.mock.calls.filter((c) => String(c[0]).includes("firecrawl"));

  it("unknown ticker: zero Firecrawl fetches, zero spendAllowed, zero Nasdaq calls", async () => {
    const f = stub({ "yahoo:QZXV": notFound });
    await expect(getTickerMarket("QZXV", NOW)).rejects.toBeInstanceOf(UnknownTicker);
    expect(fcCalls(f)).toHaveLength(0);
    expect(spendAllowed).not.toHaveBeenCalled();
    expect(calls.some((u) => u.includes("api.nasdaq.com"))).toBe(false);
  });

  it("Yahoo 429 (no price): zero Firecrawl fetches and zero spendAllowed", async () => {
    const f = stub({ "yahoo:NVDA": fail(429) });
    await expect(getTickerMarket("NVDA", NOW)).rejects.toBeInstanceOf(NoPriceError);
    expect(fcCalls(f)).toHaveLength(0);
    expect(spendAllowed).not.toHaveBeenCalled();
    expect(calls.some((u) => u.includes("api.nasdaq.com"))).toBe(false);
  });

  it("known ticker still scrapes both pages", async () => {
    const f = stub();
    await getTickerMarket("NVDA", NOW);
    expect(fcCalls(f)).toHaveLength(2);
  });

  it("a junk StockAnalysis page is not cached: a second call scrapes again", async () => {
    const f = stub({ "sa:forecast": () => new Response(ok("# 404")), "sa:ratings": () => new Response(ok("# 404")) });
    const a = await getTickerMarket("NVDA", NOW);
    expect(a.errors.stockanalysis).toBe("parse");
    expect(fcCalls(f)).toHaveLength(2);
    await getTickerMarket("NVDA", NOW);
    expect(fcCalls(f)).toHaveLength(4);
  });
});

describe("deadline / abort signal", () => {
  const hang: Handler = (_u, _b) => new Promise<Response>(() => {});
  /** stubbed fetch that waits on the request signal */
  const waitOnSignal = (init?: RequestInit) =>
    new Promise<Response>((_r, rej) => init?.signal?.addEventListener("abort", () => rej(init.signal?.reason)));

  it("pre-aborted signal: NoPriceError with errors.yahoo = deadline, no fetch, no spend", async () => {
    const f = stub();
    const c = new AbortController();
    c.abort();
    const e = (await getTickerMarket("NVDA", NOW, { signal: c.signal }).catch((x) => x)) as NoPriceError;
    expect(e).toBeInstanceOf(NoPriceError);
    expect(e.errors.yahoo).toBe("deadline");
    expect(f).not.toHaveBeenCalled();
    expect(spendAllowed).not.toHaveBeenCalled();
  });

  it("abort mid-flight returns a partial market with deadline codes and the rest intact", async () => {
    const base = stub();
    const real = base.getMockImplementation()!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        if (input.includes("targetprice") || input.includes("firecrawl")) return waitOnSignal(init);
        return real(input, init);
      }),
    );
    void hang;
    const c = new AbortController();
    setTimeout(() => c.abort(), 50);
    const m = await getTickerMarket("NVDA", NOW, { signal: c.signal });
    expect(m.price).toBe(202.35);
    expect(m.errors.nasdaq_targets).toBe("deadline");
    expect(m.errors.stockanalysis).toBe("deadline");
    expect(m.zacks).toBeNull();
    expect(m.sp).toBeNull();
    expect(m.sector).toBe("Technology");
    expect(m.next).toBeDefined();
  });

  it("a signal that aborts after Yahoo skips remaining outbound calls (no fetch, no spend)", async () => {
    const c = new AbortController();
    const f = stub({
      "yahoo:NVDA": () => {
        queueMicrotask(() => c.abort());
        return new Response(read("yahoo-chart-nvda.json"));
      },
    });
    const m = await getTickerMarket("NVDA", NOW, { signal: c.signal });
    expect(m.price).toBe(202.35);
    expect(m.errors.stockanalysis).toBe("deadline");
    expect(m.errors.nasdaq_targets).toBe("deadline");
    expect(m.errors.nasdaq_earnings).toBe("deadline");
    expect(m.errors.nasdaq_profile).toBe("deadline");
    expect(f.mock.calls.some((x) => String(x[0]).includes("firecrawl"))).toBe(false);
    expect(spendAllowed).not.toHaveBeenCalled();
  });
});

describe("Yahoo 429 retry on query2", () => {
  const byHost = (q1: Handler, q2: Handler): Handler => (u, b) => (u.includes("query2.") ? q2(u, b) : q1(u, b));
  const yahooCalls = () => calls.filter((u) => u.includes("/chart/NVDA"));

  it("retries once on query2 and succeeds", async () => {
    stub({ "yahoo:NVDA": byHost(fail(429), () => new Response(read("yahoo-chart-nvda.json"))) });
    const m = await getTickerMarket("NVDA", NOW);
    expect(m.price).toBe(202.35);
    expect(yahooCalls().map((u) => new URL(u).host)).toEqual(["query1.finance.yahoo.com", "query2.finance.yahoo.com"]);
    expect(yahooCalls()[1].split("//")[1].split("/").slice(1).join("/")).toBe(yahooCalls()[0].split("//")[1].split("/").slice(1).join("/"));
  });
  it("still 429 -> NoPriceError with errors.yahoo = http_429 after exactly two attempts", async () => {
    stub({ "yahoo:NVDA": fail(429) });
    const e = (await getTickerMarket("NVDA", NOW).catch((x) => x)) as NoPriceError;
    expect(e).toBeInstanceOf(NoPriceError);
    expect(e.errors.yahoo).toBe("http_429");
    expect(yahooCalls()).toHaveLength(2);
  });
  it("does not retry other failures", async () => {
    stub({ "yahoo:NVDA": fail(500) });
    await getTickerMarket("NVDA", NOW).catch(() => {});
    expect(yahooCalls()).toHaveLength(1);
  });
});
