"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { openHolding } from "./openHolding";

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\\-/]/g, "\\$&");

/**
 * Plain text in which held tickers become links to their holding card. Output is
 * React nodes only (never HTML), tickers match as whole words, longest first.
 */
export function Linkified({ text, tickers }: { text: string; tickers: string[] }): ReactNode {
  const re = useMemo(() => {
    const list = [...new Set(tickers.filter(Boolean))].sort((a, b) => b.length - a.length || a.localeCompare(b));
    if (!list.length) return null;
    return new RegExp(`(?<![A-Za-z0-9])(${list.map(escapeRe).join("|")})(?![A-Za-z0-9])`, "g");
  }, [tickers]);
  if (!re) return text;

  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const t = m[1];
    out.push(
      <a
        key={`${at}-${t}`}
        className="tkl"
        href={`#t-${t}`}
        data-go={t}
        onClick={(e) => {
          e.preventDefault();
          openHolding(t);
        }}
      >
        {t}
      </a>,
    );
    last = at + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}
