import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryKv, getKv, setKvForTests } from "./kv";

beforeEach(() => vi.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") }));
afterEach(() => {
  vi.useRealTimers();
  setKvForTests(null);
  vi.unstubAllEnvs();
});

describe("in-memory kv", () => {
  it("get returns null for a missing key; set/get round-trips JSON values", async () => {
    const kv = createMemoryKv();
    expect(await kv.get("a")).toBeNull();
    await kv.set("a", { x: [1, 2], y: "z" });
    expect(await kv.get("a")).toEqual({ x: [1, 2], y: "z" });
  });
  it("returns a copy, not the stored reference", async () => {
    const kv = createMemoryKv();
    const v = { n: 1 };
    await kv.set("a", v);
    v.n = 2;
    expect(await kv.get("a")).toEqual({ n: 1 });
  });
  it("expires keys after the ttl", async () => {
    const kv = createMemoryKv();
    await kv.set("a", 1, 10);
    vi.advanceTimersByTime(9_999);
    expect(await kv.get("a")).toBe(1);
    vi.advanceTimersByTime(2);
    expect(await kv.get("a")).toBeNull();
  });
  it("set without ttl does not expire", async () => {
    const kv = createMemoryKv();
    await kv.set("a", 1);
    vi.advanceTimersByTime(1e10);
    expect(await kv.get("a")).toBe(1);
  });
  it("incr creates the key with a ttl and increments", async () => {
    const kv = createMemoryKv();
    expect(await kv.incr("c", 10)).toBe(1);
    expect(await kv.incr("c", 10)).toBe(2);
    vi.advanceTimersByTime(10_001);
    expect(await kv.incr("c", 10)).toBe(1);
  });
  it("incr does not reset the ttl on later increments", async () => {
    const kv = createMemoryKv();
    await kv.incr("c", 10);
    vi.advanceTimersByTime(6_000);
    await kv.incr("c", 10);
    vi.advanceTimersByTime(5_000); // 11 s after creation
    expect(await kv.incr("c", 10)).toBe(1);
  });
  it("incrBy adds the amount, ttl only on create", async () => {
    const kv = createMemoryKv();
    expect(await kv.incrBy("c", 5, 10)).toBe(5);
    vi.advanceTimersByTime(6_000);
    expect(await kv.incrBy("c", 7, 10)).toBe(12);
    vi.advanceTimersByTime(5_000);
    expect(await kv.incrBy("c", 1, 10)).toBe(1);
  });
});

describe("getKv", () => {
  it("falls back to a shared in-memory instance without Upstash env", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    await getKv().set("k", 1);
    expect(await getKv().get("k")).toBe(1);
  });
  it("setKvForTests overrides the singleton", async () => {
    const kv = createMemoryKv();
    setKvForTests(kv);
    expect(getKv()).toBe(kv);
  });
});
