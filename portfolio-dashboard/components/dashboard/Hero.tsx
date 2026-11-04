"use client";

import { useSyncExternalStore } from "react";
import type { Dashboard } from "@/lib/dashboard/build";
import { deviceToday, tradingDaysBehind } from "@/lib/dashboard/staleness";
import { fd, pct, sgn0, usd0 } from "@/lib/format";

const tone = (n: number): string => (n >= 0 ? "gain" : "loss");
const noop = () => () => {};

/** Device date as a primitive snapshot; empty on the server so hydration never mismatches. */
const useToday = (): string => useSyncExternalStore(noop, deviceToday, () => "");

export function Hero({ dashboard: d }: { dashboard: Dashboard }) {
  const behind = tradingDaysBehind(d.asof, useToday());
  const day = d.total - d.prev;
  const unrealised = d.cost !== null && d.ret !== null ? d.costedValue - d.cost : null;
  const largest = d.positions.reduce<(typeof d.positions)[number] | null>(
    (a, p) => (!a || p.value > a.value ? p : a),
    null,
  );
  const scenario = (key: "cons" | "hc") => d.scenarios.find((s) => s.key === key);
  const cons = scenario("cons");
  const hc = scenario("hc");
  const multi = d.accounts.length > 1;
  const nPos = d.positions.length;

  return (
    <header className="hero">
      <div>
        <div className="stamp">
          <span>
            Prices <b>{fd(d.asof)} close</b>
          </span>
          <span>
            <b>{nPos}</b> {nPos === 1 ? "position" : "positions"}
          </span>
          {multi && (
            <span>
              <b>{d.accounts.length}</b> accounts
            </span>
          )}
          <span>USD</span>
          {behind >= 1 && (
            <span className="pill" style={{ color: "var(--brass)" }}>
              Prices are {behind} trading day{behind > 1 ? "s" : ""} behind
            </span>
          )}
        </div>
        <h1 className="big" aria-label="Portfolio value">
          {usd0(d.total)}
        </h1>
        <div className="deltas">
          {d.prev > 0 && (
            <span className={`pill ${tone(day)}`}>
              {sgn0(day)} · {pct(day / d.prev, 2)} since {fd(d.prevAsof)}
            </span>
          )}
          {unrealised !== null && d.ret !== null ? (
            <span className={tone(unrealised)}>
              {sgn0(unrealised)} unrealised · {pct(d.ret)}
            </span>
          ) : (
            <span className="muted">Add cost to see returns</span>
          )}
        </div>
      </div>
      <div>
        <dl className="kv">
          <div>
            <dt>Invested</dt>
            <dd>{d.cost === null ? "—" : usd0(d.cost)}</dd>
          </div>
          <div>
            <dt>Largest holding</dt>
            <dd>
              {largest ? (
                <>
                  {largest.ticker} <small>{(largest.w * 100).toFixed(1)}%</small>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt>At Street average</dt>
            <dd>
              {cons ? (
                <>
                  {usd0(cons.value)} <small className={tone(cons.ret)}>{pct(cons.ret)}</small>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt>At haircut target</dt>
            <dd>
              {hc ? (
                <>
                  {usd0(hc.value)} <small className={tone(hc.ret)}>{pct(hc.ret)}</small>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
        {multi && d.total > 0 && (
          <>
            <div
              className="split"
              role="img"
              aria-label={d.accounts.map((a) => `${a.name} ${((a.value / d.total) * 100).toFixed(0)}%`).join(", ")}
            >
              {d.accounts.map((a, i) => (
                <i key={a.name} style={{ flex: a.value, background: `var(--acc${i % 4})` }} />
              ))}
            </div>
            <div className="splitkey">
              {d.accounts.map((a, i) => (
                <span key={a.name}>
                  <span className="badge" style={{ background: `var(--acc${i % 4})` }}>
                    {a.name}
                  </span>{" "}
                  {usd0(a.value)}
                  {a.ret !== null && (
                    <>
                      {" · "}
                      <span className={tone(a.ret)}>{pct(a.ret)}</span>
                    </>
                  )}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
