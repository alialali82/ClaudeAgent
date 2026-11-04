// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Turnstile, TurnstileError, type TurnstileHandle } from "./Turnstile";

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

  it("resolves an empty token when no site key is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const ref = createRef<TurnstileHandle>();
    render(<Turnstile ref={ref} />);
    await expect(ref.current!.getToken()).resolves.toBe("");
    expect(api.render).not.toHaveBeenCalled();
  });
});
