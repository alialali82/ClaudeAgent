import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryKv, setKvForTests, type Kv } from "@/lib/kv";
import { cached, TTL } from "./cache";

let kv: Kv;
beforeEach(() => {
  kv = createMemoryKv();
  setKvForTests(kv);
});
afterEach(() => {
  setKvForTests(null);
  vi.restoreAllMocks();
});

describe("cached", () => {
  it("exports the TTL table", () => {
    expect(TTL).toEqual({ targets: 21600, prices: 300, history: 86400, profile: 604800, negative: 600 });
  });
  it("miss loads and stores with the TTL; hit does not reload", async () => {
    const set = vi.spyOn(kv, "set");
    const load = vi.fn(async () => ({ a: 1 }));
    expect(await cached("k1", 60, load)).toEqual({ a: 1 });
    expect(set).toHaveBeenCalledWith("k1", { v: { a: 1 } }, 60);
    expect(await cached("k1", 60, load)).toEqual({ a: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("failures are not cached and clear the in-flight entry", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(5);
    await expect(cached("k2", 60, load)).rejects.toThrow("x");
    expect(await cached("k2", 60, load)).toBe(5);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("undefined results are not cached", async () => {
    const set = vi.spyOn(kv, "set");
    const load = vi.fn(async () => undefined);
    expect(await cached("k3", 60, load)).toBeUndefined();
    await cached("k3", 60, load);
    expect(set).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("null results are cached", async () => {
    const load = vi.fn(async () => null);
    await cached("k4", 60, load);
    await cached("k4", 60, load);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("single-flight: concurrent calls share one load", async () => {
    let n = 0;
    const load = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return ++n;
    });
    const r = await Promise.all([cached("k5", 60, load), cached("k5", 60, load), cached("k5", 60, load)]);
    expect(r).toEqual([1, 1, 1]);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("KV down still returns load() result", async () => {
    vi.spyOn(kv, "get").mockRejectedValue(new Error("down"));
    vi.spyOn(kv, "set").mockRejectedValue(new Error("down"));
    const log = vi.spyOn(console, "error");
    expect(await cached("k6", 60, async () => 9)).toBe(9);
    expect(log).not.toHaveBeenCalled();
  });
  it.each([["garbage string", "garbage"], ["legacy {x:1}", { x: 1 }], ["{v:undefined}", { v: undefined }], ["number", 7], ["array", [1]]])(
    "falls through to load() for a malformed stored value: %s",
    async (_n, stored) => {
      await kv.set("k7", stored);
      const load = vi.fn(async () => 3);
      expect(await cached("k7", 60, load)).toBe(3);
      expect(load).toHaveBeenCalledTimes(1);
    },
  );
});
