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

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey || !box.current) return;
    const el = box.current;
    let cancelled = false;
    ready.current = loadScript()
      .then((t) => {
        if (cancelled) return;
        api.current = t;
        widget.current = t.render(el, {
          sitekey: siteKey,
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
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (widget.current) api.current?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    async getToken() {
      if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return "";
      await ready.current;
      const t = api.current;
      const id = widget.current;
      if (!t || id === null) throw new TurnstileError();
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.current = null;
          reject(new TurnstileError("timeout"));
        }, TIMEOUT_MS);
        pending.current = {
          resolve: (tok) => {
            clearTimeout(timer);
            resolve(tok);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        };
        t.reset(id);
        t.execute(id);
      });
    },
  }));

  return <div ref={box} />;
}
