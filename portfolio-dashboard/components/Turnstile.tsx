"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TIMEOUT_MS = 15_000;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export class TurnstileError extends Error {
  code = "captcha";
  constructor(message = "captcha") {
    super(message);
    this.name = "TurnstileError";
  }
}

/** The call was replaced by a newer getToken(); callers treat it as a silent cancel. */
export class TurnstileSuperseded extends Error {
  code = "superseded";
  constructor() {
    super("superseded");
    this.name = "TurnstileSuperseded";
  }
}

export type TurnstileHandle = { getToken: () => Promise<string> };

let scriptPromise: Promise<TurnstileApi> | null = null;
function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new TurnstileError()));
    s.onerror = () => {
      scriptPromise = null;
      reject(new TurnstileError());
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

type Pending = { resolve: (t: string) => void; reject: (e: Error) => void };

/**
 * Invisible Turnstile widget. `ref.current.getToken()` returns a FRESH
 * single-use token on every call (the widget is reset before each use).
 * Without a configured site key it resolves "" (server allows that outside production).
 */
export function Turnstile({ ref }: { ref?: Ref<TurnstileHandle> }) {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<TurnstileApi | null>(null);
  const widget = useRef<string | null>(null);
  const pending = useRef<Pending | null>(null);
  const ready = useRef<Promise<void> | null>(null);

  /** Loads the script and renders the widget once; a failed load is retried on the next call. */
  const ensure = (): Promise<void> => {
    const el = box.current;
    if (!el) return Promise.reject(new TurnstileError());
    if (widget.current !== null) return Promise.resolve();
    ready.current ??= loadScript().then(
      (t) => {
        ready.current = null;
        if (widget.current !== null || !box.current) return;
        api.current = t;
        widget.current = t.render(el, {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          execution: "execute",
          appearance: "interaction-only",
          callback: (token: string) => {
            pending.current?.resolve(token);
            pending.current = null;
          },
          "error-callback": () => {
            pending.current?.reject(new TurnstileError());
            pending.current = null;
          },
          "expired-callback": () => undefined,
        });
      },
      () => {
        ready.current = null;
        throw new TurnstileError();
      },
    );
    return ready.current;
  };

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return;
    ensure().catch(() => undefined);
    return () => {
      pending.current?.reject(new TurnstileSuperseded());
      pending.current = null;
      if (widget.current) api.current?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    async getToken() {
      if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return "";
      // A newer request replaces any call still waiting.
      pending.current?.reject(new TurnstileSuperseded());
      pending.current = null;
      await ensure();
      const t = api.current;
      const id = widget.current;
      if (!t || id === null) throw new TurnstileError();
      return new Promise<string>((resolve, reject) => {
        const entry: Pending = {
          resolve: (tok) => {
            clearTimeout(timer);
            resolve(tok);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        };
        const timer = setTimeout(() => {
          if (pending.current === entry) pending.current = null;
          reject(new TurnstileError("timeout"));
        }, TIMEOUT_MS);
        pending.current?.reject(new TurnstileSuperseded());
        pending.current = entry;
        t.reset(id);
        t.execute(id);
      });
    },
  }));

  return <div ref={box} />;
}
