// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Turnstile, TurnstileError, TurnstileSuperseded, type TurnstileHandle } from "./Turnstile";

type Opts = { callback: (t: string) => void; "error-callback": () => void };
let opts: Opts;
const api = {
  render: vi.fn((_el: HTMLElement, o: Opts) => {
    opts = o;
    return "w1";
  }),
  execute: vi.fn(),
  reset: vi.fn(),
  remove: vi.fn(),
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
  (window as unknown as { turnstile: unknown }).turnstile = api;
  Object.values(api).forEach((f) => f.mockClear());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  delete (window as unknown as { turnstile?: unknown }).turnstile;
});

describe("Turnstile", () => {
  it("returns a fresh token on every call and resets between uses", async () => {
    const ref = createRef<TurnstileHandle>();
    render(<Turnstile ref={ref} />);
    await act(async () => {});
    expect(api.render).toHaveBeenCalledTimes(1);
    let n = 0;
    api.execute.mockImplementation(() => opts.callback(`tok-${++n}`));
    const a = await ref.current!.getToken();
    const b = await ref.current!.getToken();
    expect([a, b]).toEqual(["tok-1", "tok-2"]);
    expect(api.reset).toHaveBeenCalledTimes(2);
  });

  it("rejects with a typed error on widget failure", async () => {
    const ref = createRef<TurnstileHandle>();
    render(<Turnstile ref={ref} />);
    await act(async () => {});
    api.execute.mockImplementation(() => opts["error-callback"]());
    await expect(ref.current!.getToken()).rejects.toBeInstanceOf(TurnstileError);
  });

  it("times out after 15 s", async () => {
    const ref = createRef<TurnstileHandle>();
    render(<Turnstile ref={ref} />);
    await act(async () => {});
    api.execute.mockImplementation(() => {});
    vi.useFakeTimers();
    const p = ref.current!.getToken();
    const assertion = expect(p).rejects.toMatchObject({ code: "captcha" });
    await vi.advanceTimersByTimeAsync(15_001);
    await assertion;
  });

  it("a superseded call rejects with a typed error and the second call survives the first call's deadline", async () => {
    const ref = createRef<TurnstileHandle>();
    render(<Turnstile ref={ref} />);
    await act(async () => {});
    api.execute.mockImplementation(() => {});
    vi.useFakeTimers();
    const first = ref.current!.getToken();
    const firstAssertion = expect(first).rejects.toBeInstanceOf(TurnstileSuperseded);
    await vi.advanceTimersByTimeAsync(10_000);
    const second = ref.current!.getToken();
    await firstAssertion;
    await vi.advanceTimersByTimeAsync(6_000); // past the first call's 15 s deadline
    opts.callback("second-token");
    await expect(second).resolves.toBe("second-token");
  });

  it("retries a failed script load on the next getToken()", async () => {
    delete (window as unknown as { turnstile?: unknown }).turnstile;
    const scripts: HTMLScriptElement[] = [];
    const append = vi.spyOn(document.head, "appendChild").mockImplementation((n) => {
      scripts.push(n as HTMLScriptElement);
      return n;
    });
    const ref = createRef<TurnstileHandle>();
    const { unmount } = render(<Turnstile ref={ref} />);
    scripts[0].onerror!(new Event("error"));
    await act(async () => {});
    // the failed load is not cached: the next call loads the script again
    const p = ref.current!.getToken();
    await act(async () => {});
    expect(scripts.length).toBe(2);
    (window as unknown as { turnstile: unknown }).turnstile = api;
    api.execute.mockImplementation(() => opts.callback("ok"));
    scripts[1].onload!(new Event("load"));
    await expect(p).resolves.toBe("ok");
    append.mockRestore();
    unmount();
  });

  it("resolves an empty token when no site key is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const ref = createRef<TurnstileHandle>();
    render(<Turnstile ref={ref} />);
    await expect(ref.current!.getToken()).resolves.toBe("");
    expect(api.render).not.toHaveBeenCalled();
  });
});
