import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryKv, setKvForTests, type Kv } from "@/lib/kv";
import { rateLimit } from "./rateLimit";
import { verifyTurnstile } from "./turnstile";
import { spendAllowed } from "./spend";
import { guardRequest } from "./guard";

const fetchMock = vi.fn();

function req(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/x", { method: "POST", headers });
}
const ip = (n: string) => ({ "x-forwarded-for": n });
const withToken = (h: Record<string, string> = {}) => ({ ...h, "x-turnstile-token": "tok" });

function brokenKv(): Kv {
  const boom = () => Promise.reject(new Error("redis down secret-1.2.3.4"));
  return { get: boom, set: boom, incr: boom, incrBy: boom };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-03-05T10:00:00Z") });
  setKvForTests(createMemoryKv());
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("TURNSTILE_SECRET", "");
  vi.stubEnv("DAILY_CLAUDE_CALLS", "");
  vi.stubEnv("DAILY_FIRECRAWL_CREDITS", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setKvForTests(null);
});

describe("rateLimit", () => {
  it("allows up to the limit then blocks", async () => {
    for (let i = 0; i < 3; i++) expect(await rateLimit("k", 3, 60)).toBe(true);
    expect(await rateLimit("k", 3, 60)).toBe(false);
  });
  it("rolls over into a new window", async () => {
    for (let i = 0; i < 3; i++) await rateLimit("k", 3, 3600);
    expect(await rateLimit("k", 3, 3600)).toBe(false);
    vi.advanceTimersByTime(3600 * 1000 + 1);
    expect(await rateLimit("k", 3, 3600)).toBe(true);
  });
  it("fails open on KV errors with a code-only warning", async () => {
    setKvForTests(brokenKv());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await rateLimit("ip:9.9.9.9", 1, 60)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("rate_limit_kv_error");
  });
});

describe("verifyTurnstile", () => {
  beforeEach(() => vi.stubEnv("TURNSTILE_SECRET", "sekret"));

  it("returns false without calling fetch for missing, empty or oversized tokens", async () => {
    expect(await verifyTurnstile(null, "1.1.1.1")).toBe(false);
    expect(await verifyTurnstile("", "1.1.1.1")).toBe(false);
    expect(await verifyTurnstile("x".repeat(2049), "1.1.1.1")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("posts form-encoded secret/response/remoteip and accepts success:true", async () => {
    fetchMock.mockResolvedValue(Response.json({ success: true }));
    expect(await verifyTurnstile("tok", "1.2.3.4")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const p = new URLSearchParams(init.body as string);
    expect(p.get("secret")).toBe("sekret");
    expect(p.get("response")).toBe("tok");
    expect(p.get("remoteip")).toBe("1.2.3.4");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("false when success is not exactly true", async () => {
    fetchMock.mockResolvedValue(Response.json({ success: "true" }));
    expect(await verifyTurnstile("tok", "1.2.3.4")).toBe(false);
    fetchMock.mockResolvedValue(Response.json({ success: false }));
    expect(await verifyTurnstile("tok", "1.2.3.4")).toBe(false);
  });
  it("false on fetch error or unparseable JSON", async () => {
    fetchMock.mockRejectedValue(new Error("net"));
    expect(await verifyTurnstile("tok", "1.2.3.4")).toBe(false);
    fetchMock.mockResolvedValue(new Response("not json"));
    expect(await verifyTurnstile("tok", "1.2.3.4")).toBe(false);
  });
  it("unset secret: allowed outside production, denied in production", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "");
    expect(await verifyTurnstile("tok", "1.2.3.4")).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(await verifyTurnstile("tok", "1.2.3.4")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("spendAllowed", () => {
  it("allows up to the default claude cap (300) then denies", async () => {
    for (let i = 0; i < 300; i++) expect(await spendAllowed("claude")).toBe(true);
    expect(await spendAllowed("claude")).toBe(false);
  });
  it("counts units for firecrawl against the default 3000 cap", async () => {
    expect(await spendAllowed("firecrawl", 3000)).toBe(true);
    expect(await spendAllowed("firecrawl", 1)).toBe(false);
  });
  it("kinds have separate counters", async () => {
    vi.stubEnv("DAILY_CLAUDE_CALLS", "1");
    expect(await spendAllowed("claude")).toBe(true);
    expect(await spendAllowed("claude")).toBe(false);
    expect(await spendAllowed("firecrawl")).toBe(true);
  });
  it("reads caps from env and ignores invalid values", async () => {
    vi.stubEnv("DAILY_CLAUDE_CALLS", "2");
    expect(await spendAllowed("claude")).toBe(true);
    expect(await spendAllowed("claude")).toBe(true);
    expect(await spendAllowed("claude")).toBe(false);
    for (const bad of ["abc", "0", "-5", "1.5", "NaN"]) {
      setKvForTests(createMemoryKv());
      vi.stubEnv("DAILY_CLAUDE_CALLS", bad);
      for (let i = 0; i < 300; i++) expect(await spendAllowed("claude")).toBe(true);
      expect(await spendAllowed("claude")).toBe(false);
    }
  });
  it("counter keys roll by UTC date", async () => {
    vi.stubEnv("DAILY_CLAUDE_CALLS", "1");
    const kv = createMemoryKv();
    setKvForTests(kv);
    expect(await spendAllowed("claude", 1, new Date("2026-03-05T23:59:59Z"))).toBe(true);
    expect(await spendAllowed("claude", 1, new Date("2026-03-05T23:59:59Z"))).toBe(false);
    expect(await spendAllowed("claude", 1, new Date("2026-03-06T00:00:00Z"))).toBe(true);
    expect(await kv.get("spend:claude:2026-03-05")).toBe(2);
    expect(await kv.get("spend:claude:2026-03-06")).toBe(1);
  });
  it("fails closed on KV errors", async () => {
    setKvForTests(brokenKv());
    expect(await spendAllowed("claude")).toBe(false);
    expect(await spendAllowed("firecrawl", 5)).toBe(false);
  });
});

describe("guardRequest", () => {
  const extract = { route: "extract", needsCaptcha: true } as const;
  const analyze = { route: "analyze", needsCaptcha: false } as const;

  it("allows a normal extract request", async () => {
    expect(await guardRequest(req(withToken(ip("1.1.1.1"))), extract)).toEqual({ ok: true });
  });
  it("blocks the 11th extract request per IP per hour", async () => {
    for (let i = 0; i < 10; i++) expect((await guardRequest(req(withToken(ip("1.1.1.1"))), extract)).ok).toBe(true);
    expect(await guardRequest(req(withToken(ip("1.1.1.1"))), extract)).toEqual({ ok: false, status: 429, code: "rate_limited" });
  });
  it("analyze allows 30 per hour and blocks the 31st", async () => {
    for (let i = 0; i < 30; i++) expect((await guardRequest(req(ip("2.2.2.2")), analyze)).ok).toBe(true);
    expect(await guardRequest(req(ip("2.2.2.2")), analyze)).toEqual({ ok: false, status: 429, code: "rate_limited" });
  });
  it("different IPs have separate buckets; window rolls over", async () => {
    for (let i = 0; i < 10; i++) await guardRequest(req(withToken(ip("1.1.1.1"))), extract);
    expect((await guardRequest(req(withToken(ip("1.1.1.1"))), extract)).ok).toBe(false);
    expect((await guardRequest(req(withToken(ip("3.3.3.3"))), extract)).ok).toBe(true);
    vi.advanceTimersByTime(3600 * 1000 + 1);
    expect((await guardRequest(req(withToken(ip("1.1.1.1"))), extract)).ok).toBe(true);
  });
  it("parses X-Forwarded-For: first hop, trimmed; spoofed later hops do not matter", async () => {
    for (let i = 0; i < 10; i++) await guardRequest(req(withToken(ip(" 1.1.1.1 , 9.9.9.9"))), extract);
    // same first hop, different tail -> same bucket
    expect((await guardRequest(req(withToken(ip("1.1.1.1, 8.8.8.8"))), extract)).ok).toBe(false);
    // a different first hop -> different bucket
    expect((await guardRequest(req(withToken(ip("9.9.9.9, 1.1.1.1"))), extract)).ok).toBe(true);
  });
  it("falls back to x-real-ip, then a shared 'unknown' bucket", async () => {
    for (let i = 0; i < 10; i++) await guardRequest(req(withToken({ "x-real-ip": "4.4.4.4" })), extract);
    expect((await guardRequest(req(withToken({ "x-real-ip": "4.4.4.4" })), extract)).ok).toBe(false);
    for (let i = 0; i < 10; i++) expect((await guardRequest(req(withToken()), extract)).ok).toBe(true);
    expect((await guardRequest(req(withToken()), extract)).ok).toBe(false);
  });
  it("missing Turnstile token -> 400 captcha, fetch never called", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "sekret");
    expect(await guardRequest(req(ip("1.1.1.1")), extract)).toEqual({ ok: false, status: 400, code: "captcha" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("failed Turnstile -> captcha; success -> ok", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "sekret");
    fetchMock.mockResolvedValueOnce(Response.json({ success: false }));
    expect(await guardRequest(req(withToken(ip("1.1.1.1"))), extract)).toEqual({ ok: false, status: 400, code: "captcha" });
    fetchMock.mockResolvedValueOnce(Response.json({ success: true }));
    expect(await guardRequest(req(withToken(ip("1.1.1.1"))), extract)).toEqual({ ok: true });
  });
  it("does not require a token when needsCaptcha is false", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "sekret");
    expect((await guardRequest(req(ip("1.1.1.1")), analyze)).ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("spend cap reached -> 503 busy and the upstream stub is not called", async () => {
    vi.stubEnv("DAILY_CLAUDE_CALLS", "1");
    const upstream = vi.fn();
    const handler = async () => {
      const g = await guardRequest(req(withToken(ip("1.1.1.1"))), extract);
      if (!g.ok) return g;
      upstream();
      return g;
    };
    expect(await handler()).toEqual({ ok: true });
    expect(await handler()).toEqual({ ok: false, status: 503, code: "busy" });
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("analyze route does not consume claude spend", async () => {
    vi.stubEnv("DAILY_CLAUDE_CALLS", "1");
    for (let i = 0; i < 5; i++) expect((await guardRequest(req(ip("1.1.1.1")), analyze)).ok).toBe(true);
  });
  it("never throws when KV is down: rate limit fails open (warn), spend fails closed", async () => {
    setKvForTests(brokenKv());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(guardRequest(req(withToken(ip("1.1.1.1"))), extract)).resolves.toEqual({ ok: false, status: 503, code: "busy" });
    await expect(guardRequest(req(ip("1.1.1.1")), analyze)).resolves.toEqual({ ok: true });
    expect(warn).toHaveBeenCalledWith("rate_limit_kv_error");
    for (const c of warn.mock.calls) expect(JSON.stringify(c)).not.toContain("1.1.1.1");
  });
  it("never throws on unexpected errors -> 503 busy", async () => {
    const bad = { headers: { get: () => { throw new Error("x"); } } } as unknown as Request;
    await expect(guardRequest(bad, extract)).resolves.toEqual({ ok: false, status: 503, code: "busy" });
  });
});
