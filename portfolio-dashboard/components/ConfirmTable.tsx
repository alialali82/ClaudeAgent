"use client";

import { useState } from "react";
import { serializeHoldings } from "@/lib/files";
import { HOLDINGS_MAX } from "@/lib/limits";
import { normalizeTicker } from "@/lib/parse/normalize";
import { dupCounts, holdingsToAnalyze, newRow, rowIssues, validHoldings, type Row } from "@/lib/rows";
import type { Holding } from "@/lib/types";

type Props = {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  onAnalyze: (holdings: Holding[]) => void;
  warnings?: string[];
};

function download(holdings: Holding[]) {
  const url = URL.createObjectURL(new Blob([serializeHoldings(holdings)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "my-holdings.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ConfirmTable({ rows, onChange, onAnalyze, warnings = [] }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const patch = (id: string, p: Partial<Row>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const tooMany = rows.length > HOLDINGS_MAX;
  const valid = validHoldings(rows);
  const dups = dupCounts(rows);
  const canAnalyze = !tooMany && valid.length > 0;

  return (
    <section className="stack" aria-labelledby="confirm-h">
      <h1 id="confirm-h" className="brand">Check your holdings</h1>
      <p className="muted">Fix anything that looks wrong. Rows with a warning that can&apos;t be analyzed are left out.</p>

      {warnings.length > 0 && !dismissed && (
        <div className="notice" role="region" aria-label="File warnings">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <button type="button" className="btn-link" onClick={() => setDismissed(true)}>
            Dismiss warnings
          </button>
        </div>
      )}

      {tooMany && (
        <p className="alert" role="alert">
          Too many rows: max {HOLDINGS_MAX} holdings. Delete {rows.length - HOLDINGS_MAX} to continue.
        </p>
      )}

      <ul className="rows panel" aria-label="Holdings">
        {rows.map((r) => {
          const issues = rowIssues(r, dups);
          const id = (s: string) => `${r.id}-${s}`;
          const desc = (key: keyof typeof issues) => (issues[key] ? id(key) : undefined);
          return (
            <li key={r.id} className="row">
              <div className="field">
                <label htmlFor={id("t")}>Ticker</label>
                <input
                  id={id("t")}
                  value={r.ticker}
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-invalid={issues.ticker ? true : undefined}
                  aria-describedby={desc("ticker")}
                  onChange={(e) => patch(r.id, { ticker: e.target.value })}
                  onBlur={() => {
                    const n = normalizeTicker(r.ticker);
                    if (n && n !== r.ticker) patch(r.id, { ticker: n });
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor={id("s")}>Shares</label>
                <input
                  id={id("s")}
                  inputMode="decimal"
                  value={r.shares}
                  aria-invalid={issues.shares ? true : undefined}
                  aria-describedby={desc("shares")}
                  onChange={(e) => patch(r.id, { shares: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor={id("c")}>Cost</label>
                <input id={id("c")} inputMode="decimal" value={r.cost} aria-describedby={desc("cost")} onChange={(e) => patch(r.id, { cost: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={id("k")}>Cost type</label>
                <select id={id("k")} value={r.costKind} onChange={(e) => patch(r.id, { costKind: e.target.value as Row["costKind"] })}>
                  <option value="total">Total</option>
                  <option value="perShare">Per share</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={id("a")}>Account</label>
                <input id={id("a")} value={r.account} aria-invalid={issues.account ? true : undefined} aria-describedby={desc("account")} onChange={(e) => patch(r.id, { account: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={id("d")}>Open date</label>
                <input id={id("d")} type="date" value={r.openDate} aria-invalid={issues.date ? true : undefined} aria-describedby={desc("date")} onChange={(e) => patch(r.id, { openDate: e.target.value })} />
              </div>
              <div className="field">
                <span className="lbl" aria-hidden="true">&nbsp;</span>
                <button type="button" className="btn" onClick={() => onChange(rows.filter((x) => x.id !== r.id))}>
                  Delete row
                </button>
              </div>
              {(r.source === "ai" || Object.keys(issues).length > 0) && (
                <div className="full" style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: "4px 14px", alignItems: "center" }}>
                  {r.source === "ai" && <span className="tag">AI-read — check</span>}
                  {(["ticker", "shares", "account", "date", "duplicate", "cost"] as const).map((k) =>
                    issues[k] ? (
                      <p key={k} id={id(k)} className="warn">
                        {issues[k]}
                      </p>
                    ) : null,
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={() => onChange([...rows, newRow()])}>
          Add row
        </button>
        <button type="button" className="btn" disabled={valid.length === 0} onClick={() => download(valid)}>
          Save my holdings (.json)
        </button>
      </div>
      <div>
        <button type="button" className="btn btn-primary" disabled={!canAnalyze} onClick={() => onAnalyze(holdingsToAnalyze(rows))}>
          Analyze {valid.length > 0 ? `${valid.length} ${valid.length === 1 ? "holding" : "holdings"}` : ""}
        </button>
      </div>
    </section>
  );
}
