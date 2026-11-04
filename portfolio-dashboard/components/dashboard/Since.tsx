"use client";

import type { Dashboard } from "@/lib/dashboard/build";
import { fd, pct, sgn0 } from "@/lib/format";
import { Linkified } from "./Linkified";
import { openHolding } from "./openHolding";

const tone = (n: number): string => (n >= 0 ? "gain" : "loss");

export function Since({ dashboard: d }: { dashboard: Dashboard }) {
  const tickers = d.positions.map((p) => p.ticker);
  const change = d.total - d.prev;
  const byMove = [...d.positions].sort((a, b) => b.dayUsd - a.dayUsd);
  const picked = [...byMove.slice(0, 4), ...byMove.slice(-4).reverse()].filter(
    (p, i, a) => a.findIndex((q) => q.ticker === p.ticker) === i,
  );
  const biggest = Math.max(0, ...picked.map((p) => Math.abs(p.dayUsd)));
  const multi = d.accounts.length > 1;

  return (
    <section className="sec" id="since-sec">
      <div className="sechead">
        <h2>Since {fd(d.prevAsof)} close</h2>
        <p>
          <span className={tone(change)}>
            {sgn0(change)}
            {d.prev > 0 && ` (${pct(change / d.prev, 2)})`}
          </span>
          {multi ? ` across ${d.accounts.length} accounts.` : " across the portfolio."}
        </p>
      </div>
      <div className="since">
        <div>
          <p className="eyebrow" style={{ marginBottom: 8 }}>
            Biggest moves in dollars
          </p>
          <div className="movers">
            {picked.map((p) => {
              const w = biggest > 0 ? (Math.abs(p.dayUsd) / biggest) * 50 : 0;
              return (
                <div className="mv" key={p.ticker}>
                  <span>
                    <a
                      className="tkl"
                      href={`#t-${p.ticker}`}
                      data-go={p.ticker}
                      onClick={(e) => {
                        e.preventDefault();
                        openHolding(p.ticker);
                      }}
                    >
                      {p.ticker}
                    </a>
                  </span>
                  <span className="bar">
                    <i
                      style={{
                        [p.dayUsd >= 0 ? "left" : "right"]: "50%",
                        width: `${w}%`,
                        background: `var(--${p.dayUsd >= 0 ? "gain" : "loss"})`,
                      }}
                    />
                  </span>
                  <span className={`v ${tone(p.dayUsd)}`}>
                    {sgn0(p.dayUsd)}
                    <br />
                    <small>{pct(p.day)}</small>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            What changed
          </p>
          {d.changes.length ? (
            <ul className="changes">
              {d.changes.map((c, i) => (
                <li key={`${c.key}-${i}`}>
                  <span className="t">{c.key}</span>
                  <span>
                    <Linkified text={c.text} tickers={tickers} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No changes to report.</p>
          )}
        </div>
      </div>
    </section>
  );
}
