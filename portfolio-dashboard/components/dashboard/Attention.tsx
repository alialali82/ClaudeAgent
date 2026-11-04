"use client";

import type { Dashboard } from "@/lib/dashboard/build";
import { Linkified } from "./Linkified";

export function Attention({ dashboard }: { dashboard: Dashboard }) {
  if (!dashboard.flags.length) return null;
  const tickers = dashboard.positions.map((p) => p.ticker);
  return (
    <div className="attn">
      {dashboard.flags.map((f, i) => (
        <div key={`${f.key}-${i}`} className={`flag ${f.tone}`}>
          <span className="k">{f.key}</span>
          <p>
            <Linkified text={f.text} tickers={tickers} />
          </p>
        </div>
      ))}
    </div>
  );
}
