import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, HttpError } from "./http";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const spies = () => (["log", "warn", "error", "info", "debug"] as const).map((m) => vi.spyOn(console, m));

describe("fetchJson", () => {
  it("returns parsed JSON and sends generic browser headers", async () => {
    const f = vi.fn(async () => new Response('{"a":1}', { status: 200 }));
    vi.stubGlobal("fetch", f);
    const s = spies();
    expect(await fetchJson("https://example.test/x")).toEqual({ a: 1 });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    const h = init.headers as Record<string, string>;
    expect(h.Accept).toBe("application/json");
    expect(h["User-Agent"]).toMatch(/^Mozilla\/5\.0/);
    expect(Object.keys(h).sort()).toEqual(["Accept", "User-Agent"]);
    s.forEach((x) => expect(x).not.toHaveBeenCalled());
  });
  it("maps non-2xx to http_<status>", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 403 }));
    await expect(fetchJson("https://example.test/x")).rejects.toMatchObject({ name: "HttpError", code: "http_403" });
  });
  it("maps invalid JSON to bad_json", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>", { status: 200 }));
    await expect(fetchJson("https://example.test/x")).rejects.toMatchObject({ code: "bad_json" });
  });
  it("times out", async () => {
    vi.stubGlobal(
      "fetch",
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(init.signal?.reason))),
    );
    await expect(fetchJson("https://example.test/x", { timeoutMs: 20 })).rejects.toMatchObject({ code: "timeout" });
  });
  it("rejects bodies over 2 MB", async () => {
    vi.stubGlobal("fetch", async () => new Response("[" + "1,".repeat(1_100_000) + "1]", { status: 200 }));
    const e = await fetchJson("https://example.test/x").catch((x) => x);
    expect(e).toBeInstanceOf(HttpError);
    expect(e.code).toBe("too_large");
  });
  it("network failure gives a generic code without the message", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("secret-host.internal refused");
    });
    const e = await fetchJson("https://example.test/x").catch((x) => x);
    expect(e.code).toBe("network");
    expect(e.message).not.toMatch(/secret/);
  });
});
